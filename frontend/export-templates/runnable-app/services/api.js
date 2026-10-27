// The design's API server: the app's features. What it can do follows the design:
//   accounts   (auth)            sign up / in / out (here, or through the auth component)
//   items      (database)        your items, saved in PostgreSQL (in memory without a database)
//   cache      (cache)           your item list is served from Redis when it can be
//   processing (queue + worker)  "Process" puts a job on the queue; the worker does it
//   search     (search)          search your items
//   files      (object storage)  attach a file to an item
// Every response says what each part did (X-Trace-Steps), for the page's "How it works" panel.

import http from "node:http";
import { createClient } from "redis";

import { config, cookies, db, env, ms, readBody, readJson, SELF, sendJson, step, waitFor } from "./common.js";
import { COOKIE, sessionCookie, signOut, signUpOrIn, userForToken } from "./authCore.js";

const server = config.server.node;
const data = config.data;
const auth = config.auth;
const MAX_FILE = 5 * 1024 * 1024;

// ---- Connections ----
const cache = data.cache && env("CACHE_URL") ? createClient({ url: env("CACHE_URL") }) : null;
const queue = data.queue && env("QUEUE_URL") ? createClient({ url: env("QUEUE_URL") }) : null;
for (const client of [cache, queue]) client?.on("error", () => undefined);
const searchUrl = data.search ? env("SEARCH_URL") : "";
const storageUrl = data.storage ? env("STORAGE_URL") : "";
const authUrl = auth.mode === "service" ? env("AUTH_URL") : "";

// Without a database, items live in this server's memory (each API server has its own).
const memory = { items: [], next: 1 };

async function setUpSearch() {
  if (!searchUrl) return;
  const headers = { Authorization: `Bearer ${env("SEARCH_KEY")}`, "Content-Type": "application/json" };
  await waitFor("search", async () => {
    const health = await fetch(`${searchUrl}/health`);
    if (!health.ok) throw new Error("search not ready");
  });
  await fetch(`${searchUrl}/indexes`, { method: "POST", headers, body: JSON.stringify({ uid: "items", primaryKey: "id" }) });
  await fetch(`${searchUrl}/indexes/items/settings`, { method: "PATCH", headers, body: JSON.stringify({ filterableAttributes: ["owner_id"], searchableAttributes: ["title", "body"] }) });
}

// ---- Who is asking ----
async function currentUser(request, steps) {
  if (auth.mode === "none") return { id: null, email: null };
  if (auth.mode === "on-path") {
    // The auth component in front already checked the session and attached the user.
    const id = Number(request.headers["x-user-id"]);
    return Number.isInteger(id) && id > 0 ? { id, email: String(request.headers["x-user-email"] ?? "") } : null;
  }
  if (auth.mode === "service") {
    const started = performance.now();
    const answer = await fetch(`${authUrl}/internal/verify`, { headers: { cookie: request.headers.cookie ?? "" } });
    const body = await answer.json();
    steps.push(step(server, `Asked the auth service who this is (${ms(started)} ms).`), ...decodeHeader(answer.headers.get("x-trace-steps")));
    return body.user ?? null;
  }
  const result = await userForToken(cookies(request.headers.cookie)[COOKIE], server);
  steps.push(...result.steps);
  return result.user;
}
function decodeHeader(value) {
  try {
    return JSON.parse(decodeURIComponent(value ?? "[]"));
  } catch {
    return [];
  }
}

// ---- Items ----
const listKey = (user) => `items:${user.id ?? "everyone"}`;
const owner = (user) => user.id ?? null;
const fromRow = (row) => ({
  id: row.id, title: row.title, body: row.body, status: row.status, wordCount: row.word_count, processedBy: row.processed_by,
  processedAt: row.processed_at, fileName: row.file_name, hasFile: Boolean(row.file_key), createdAt: row.created_at,
});

async function forget(user, steps) {
  if (!cache) return;
  const started = performance.now();
  await cache.del(listKey(user));
  steps.push(step(data.cache.node, "Removed the cached item list, so the next read gets fresh data.", { ms: ms(started) }));
}

async function listItems(user, steps) {
  if (cache) {
    const started = performance.now();
    const cached = await cache.get(listKey(user));
    if (cached) {
      steps.push(step(data.cache.node, "Cache hit: answered with the saved item list. The database was not asked.", { ms: ms(started), hit: true }));
      return JSON.parse(cached);
    }
    steps.push(step(data.cache.node, "Cache miss: no saved item list yet.", { ms: ms(started), hit: false }));
  }
  let items;
  if (db) {
    const started = performance.now();
    const rows = (await db.query("SELECT * FROM items WHERE owner_id IS NOT DISTINCT FROM $1 ORDER BY id DESC LIMIT 100", [owner(user)])).rows;
    items = rows.map(fromRow);
    steps.push(step(data.database.node, `Read ${items.length} item${items.length === 1 ? "" : "s"}.`, { ms: ms(started) }));
  } else {
    items = memory.items.filter((item) => item.owner === owner(user)).map((item) => {
      const { fileKey, ...shown } = item;
      delete shown.owner;
      return { ...shown, hasFile: Boolean(fileKey) };
    }).reverse();
    steps.push(step(server, `Read ${items.length} items from this server's memory (the design has no database).`));
  }
  if (cache) {
    const started = performance.now();
    await cache.set(listKey(user), JSON.stringify(items), { EX: 60 });
    steps.push(step(data.cache.node, "Saved the list in the cache for 60 seconds.", { ms: ms(started) }));
  }
  return items;
}

async function getItem(user, id) {
  if (db) return (await db.query("SELECT * FROM items WHERE id = $1 AND owner_id IS NOT DISTINCT FROM $2", [id, owner(user)])).rows[0] ?? null;
  const item = memory.items.find((candidate) => candidate.id === id && candidate.owner === owner(user));
  return item ? { ...item, file_key: item.fileKey, file_name: item.fileName } : null;
}

async function indexItem(item, user, steps) {
  if (!searchUrl) return;
  const started = performance.now();
  await fetch(`${searchUrl}/indexes/items/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("SEARCH_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify([{ id: item.id, title: item.title, body: item.body, owner_id: owner(user) ?? 0 }]),
  });
  steps.push(step(data.search.node, `Indexed item #${item.id} so it can be searched.`, { ms: ms(started) }));
}

function readItemInput(input) {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body : "";
  if (!title || title.length > 200) return { error: "Give the item a title (up to 200 characters)." };
  if (body.length > 10_000) return { error: "Keep the text under 10,000 characters." };
  return { title, body };
}

// ---- Routes ----
async function route(request, response, path, steps) {
  const send = (status, body, extra = {}) => sendJson(response, status, body, steps, { "X-Trace-Api": SELF, ...extra });

  // Accounts (when the auth component is not in front of us).
  if (path.startsWith("/api/auth/")) {
    if (auth.mode === "none") return send(404, { error: "This design has no authentication." });
    if (auth.mode === "service") {
      const started = performance.now();
      const answer = await fetch(`${authUrl}${path}`, {
        method: request.method,
        headers: { cookie: request.headers.cookie ?? "", "content-type": "application/json" },
        ...(request.method === "POST" ? { body: await readBody(request) } : {}),
      });
      steps.push(step(server, `Passed the request to the auth service (${ms(started)} ms).`), ...decodeHeader(answer.headers.get("x-trace-steps")));
      const cookie = answer.headers.get("set-cookie");
      return send(answer.status, await answer.json(), cookie ? { "Set-Cookie": cookie } : {});
    }
    const token = cookies(request.headers.cookie)[COOKIE];
    steps.push(step(server, "Handled sign-in itself (the design has no separate auth service)."));
    if (request.method === "POST" && (path === "/api/auth/signup" || path === "/api/auth/signin")) {
      const result = await signUpOrIn(path.endsWith("signup") ? "signup" : "signin", await readJson(request), server);
      steps.push(...result.steps);
      return send(result.status, result.body, result.token ? { "Set-Cookie": sessionCookie(result.token) } : {});
    }
    if (request.method === "POST" && path === "/api/auth/signout") {
      steps.push(...(await signOut(token, server)));
      return send(200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) });
    }
    if (request.method === "GET" && path === "/api/auth/me") {
      const result = await userForToken(token, server);
      steps.push(...result.steps);
      return send(200, { user: result.user });
    }
    return send(404, { error: "Not found." });
  }

  if (path === "/api/health") return send(200, { ok: true, instance: SELF });

  const user = await currentUser(request, steps);
  if (!user) return send(401, { error: "Sign in first." });

  // List, or search.
  if (request.method === "GET" && path === "/api/items") {
    const query = new URL(request.url, "http://app").searchParams.get("q")?.trim() ?? "";
    if (query && searchUrl) {
      const started = performance.now();
      const answer = await fetch(`${searchUrl}/indexes/items/search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env("SEARCH_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, filter: `owner_id = ${owner(user) ?? 0}`, limit: 50 }),
      });
      const ids = ((await answer.json()).hits ?? []).map((hit) => hit.id);
      steps.push(step(data.search.node, `Searched for “${query}”: ${ids.length} match${ids.length === 1 ? "" : "es"}.`, { ms: ms(started) }));
      let items = [];
      if (ids.length > 0 && db) {
        const read = performance.now();
        const rows = (await db.query("SELECT * FROM items WHERE id = ANY($1) AND owner_id IS NOT DISTINCT FROM $2", [ids, owner(user)])).rows;
        items = ids.map((id) => rows.find((row) => row.id === id)).filter(Boolean).map(fromRow);
        steps.push(step(data.database.node, `Read the ${items.length} matching item${items.length === 1 ? "" : "s"}.`, { ms: ms(read) }));
      }
      return send(200, { items, query });
    }
    const items = await listItems(user, steps);
    return send(200, { items: query ? items.filter((item) => `${item.title} ${item.body}`.toLowerCase().includes(query.toLowerCase())) : items, query });
  }

  // Create.
  if (request.method === "POST" && path === "/api/items") {
    const input = readItemInput(await readJson(request));
    if (input.error) return send(400, { error: input.error });
    let item;
    if (db) {
      const started = performance.now();
      item = fromRow((await db.query("INSERT INTO items (owner_id, title, body) VALUES ($1, $2, $3) RETURNING *", [owner(user), input.title, input.body])).rows[0]);
      steps.push(step(data.database.node, `Saved item #${item.id}.`, { ms: ms(started) }));
    } else {
      item = { id: memory.next++, owner: owner(user), title: input.title, body: input.body, status: "new", createdAt: new Date().toISOString() };
      memory.items.push(item);
      steps.push(step(server, `Kept item #${item.id} in this server's memory.`));
    }
    await forget(user, steps);
    await indexItem(item, user, steps);
    return send(201, { item });
  }

  const match = /^\/api\/items\/(\d+)(\/process|\/file)?$/.exec(path);
  if (!match) return send(404, { error: "Not found." });
  const id = Number(match[1]);
  const existing = await getItem(user, id);
  if (!existing) return send(404, { error: "No such item." });

  // Process in the background.
  if (match[2] === "/process" && request.method === "POST") {
    if (!queue) return send(400, { error: "This design has no queue." });
    if (db) await db.query("UPDATE items SET status = 'queued', updated_at = now() WHERE id = $1", [id]);
    const started = performance.now();
    await queue.lPush("jobs", JSON.stringify({ itemId: id, ownerId: owner(user), queuedBy: SELF, at: Date.now() }));
    steps.push(step(data.queue.node, `Put a job for item #${id} on the queue. The API answers now; the worker does the work later.`, { ms: ms(started) }));
    await forget(user, steps);
    return send(202, { queued: true });
  }

  // Attach or download a file.
  if (match[2] === "/file") {
    if (!storageUrl) return send(400, { error: "This design has no object storage." });
    if (request.method === "PUT") {
      const content = await readBody(request, MAX_FILE);
      const name = String(request.headers["x-file-name"] ?? "file").replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "file";
      const key = `${owner(user) ?? 0}/${id}/${Date.now()}-${name.replace(/\s+/g, "_")}`;
      const started = performance.now();
      const put = await fetch(`${storageUrl}/files/${encodeURIComponent(key).replace(/%2F/g, "/")}`, {
        method: "PUT",
        headers: { "Content-Type": String(request.headers["content-type"] ?? "application/octet-stream") },
        body: content,
      });
      if (!put.ok) {
        steps.push(step(data.storage.node, `Refused the file (${put.status}).`, { ok: false }));
        return send(502, { error: "Object storage did not accept the file." });
      }
      steps.push(step(data.storage.node, `Stored “${name}” (${Math.ceil(content.length / 1024)} KB).`, { ms: ms(started) }));
      if (db) {
        await db.query("UPDATE items SET file_key = $1, file_name = $2, updated_at = now() WHERE id = $3", [key, name, id]);
        steps.push(step(data.database.node, `Saved where the file is on item #${id}.`));
      } else {
        Object.assign(memory.items.find((item) => item.id === id), { fileKey: key, fileName: name });
      }
      await forget(user, steps);
      return send(200, { ok: true });
    }
    if (request.method === "GET") {
      const key = existing.file_key;
      if (!key) return send(404, { error: "No file on this item." });
      const file = await fetch(`${storageUrl}/files/${encodeURIComponent(key).replace(/%2F/g, "/")}`);
      if (!file.ok) return send(502, { error: "Object storage did not return the file." });
      response.writeHead(200, {
        "Content-Type": file.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${String(existing.file_name ?? "file").replace(/"/g, "")}"`,
        "X-Trace-Api": SELF,
      });
      return response.end(Buffer.from(await file.arrayBuffer()));
    }
  }

  // Edit.
  if (!match[2] && request.method === "PATCH") {
    const input = readItemInput(await readJson(request));
    if (input.error) return send(400, { error: input.error });
    let item;
    if (db) {
      const started = performance.now();
      item = fromRow((await db.query("UPDATE items SET title = $1, body = $2, updated_at = now() WHERE id = $3 RETURNING *", [input.title, input.body, id])).rows[0]);
      steps.push(step(data.database.node, `Updated item #${id}.`, { ms: ms(started) }));
    } else {
      item = Object.assign(memory.items.find((candidate) => candidate.id === id), input);
    }
    await forget(user, steps);
    await indexItem(item, user, steps);
    return send(200, { item });
  }

  // Delete.
  if (!match[2] && request.method === "DELETE") {
    if (db) {
      const started = performance.now();
      await db.query("DELETE FROM items WHERE id = $1", [id]);
      steps.push(step(data.database.node, `Deleted item #${id}.`, { ms: ms(started) }));
    } else {
      memory.items = memory.items.filter((item) => item.id !== id);
    }
    await forget(user, steps);
    if (searchUrl) {
      await fetch(`${searchUrl}/indexes/items/documents/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${env("SEARCH_KEY")}` } });
      steps.push(step(data.search.node, `Removed item #${id} from the search index.`));
    }
    return send(200, { ok: true });
  }

  return send(405, { error: "Not allowed." });
}

const http_server = http.createServer(async (request, response) => {
  const path = (request.url ?? "/").split("?")[0];
  const steps = [step(server, `${SELF} received ${request.method} ${path}.`)];
  try {
    await route(request, response, path, steps);
  } catch (error) {
    console.error(`${SELF}:`, error.message);
    if (!response.headersSent) {
      sendJson(response, error.status ?? 500, { error: error.status === 413 ? "That is too large." : error.status ? "Invalid request." : "The API server failed." }, [...steps, step(server, "Failed.", { ok: false })], { "X-Trace-Api": SELF });
    }
  }
});

await Promise.all([
  cache && waitFor("cache", () => cache.connect()),
  queue && waitFor("queue", () => queue.connect()),
  db && waitFor("database", () => db.query("SELECT 1 FROM items LIMIT 1")),
  setUpSearch().catch((error) => console.error(`${SELF}: search setup failed`, error.message)),
]);
http_server.listen(Number(process.env.PORT ?? 3000), () => console.log(`${SELF} (API server) listening`));
