// "Run in ARCHITECH": the app a design runs as (the same app the Docker export runs, see
// export/runnableApp.ts and export-templates/runnable-app), acted out inside ARCHITECH's server.
//
// Each part of the design does what its container does in the Docker app, in the same order, and
// reports it the same way: X-Trace-<part> headers with the address it sent the request on to, and
// X-Trace-Steps with what each part did. The page (export-templates/runnable-app/web/index.html)
// is the same file in both, so Archie and the highlighting work identically.
//
// What people do in the app is real: accounts are hashed and stored, sessions are checked, items
// are saved (in the run_* tables, per project) when the design has a database. Parts that are in
// memory in the Docker app (a cache, the items of a design without a database) are in memory here.
// The difference: the parts are not separate machines; they are played in turn by this server.

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { prisma } from "../../prisma";
import { runnableAppFiles, type Design } from "../export/runnableApp";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, length: number) => Promise<Buffer>;

// ---- The app's settings: exactly the Docker app's app.config.json ----

type Hop = { node: string; label: string; kind: "proxy" | "dns" | "auth" | "pass" | "server"; container?: string; name?: string; resolvedBy?: string; cdn?: boolean };
type PartRef = { node: string; label: string } | null;
export type RunConfig = {
  title: string;
  path: Hop[];
  server: { node: string; label: string; containers: string[] };
  data: { database: PartRef; cache: PartRef; queue: PartRef; worker: PartRef; search: PartRef; storage: PartRef };
  auth: { mode: "on-path" | "service" | "in-api" | "none"; node: string | null; database: string | null };
  features: { auth: boolean; queue: boolean; search: boolean; files: boolean };
  addresses: Record<string, string>;
  [key: string]: unknown;
};

export function runConfig(design: Design): RunConfig {
  return JSON.parse(runnableAppFiles(design, {}).files["app.config.json"]!) as RunConfig;
}

// ---- Requests and answers ----

export type RunRequest = { method: string; path: string; query: URLSearchParams; headers: Headers; body: Uint8Array };
export type RunResponse = { status: number; json?: unknown; bytes?: Uint8Array; headers: Record<string, string> };
type Step = { node: string; text: string; ms?: number; ok?: boolean; hit?: boolean };

export const MAX_FILE = 5 * 1024 * 1024;
export const MAX_ITEMS = 1000;
export const MAX_USERS = 200;
const SESSION_DAYS = 7;
const WORK_MS = 1500; // the worker's pause, standing in for real work (as in worker.js)
const COOKIE = "app_session";
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

const step = (node: string, text: string, extra: Omit<Step, "node" | "text"> = {}): Step => ({ node, text, ...extra });
const ms = (since: number) => Math.round(performance.now() - since);
const encodeSteps = (steps: Step[]) => encodeURIComponent(JSON.stringify(steps));
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function cookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index > 0) {
      try {
        out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        // A cookie that is not ours.
      }
    }
  }
  return out;
}

function readJson(request: RunRequest): Record<string, unknown> {
  const raw = new TextDecoder().decode(request.body);
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, "Invalid request.");
  }
}

// ---- What lives in memory (as it does in the Docker app): per project ----

type MemoryUser = { id: number; email: string; passwordHash: string };
type MemoryItem = { id: number; owner: number | null; title: string; body: string; status: string; createdAt: string; fileName?: string; fileType?: string; fileData?: Uint8Array };
type Memory = {
  users: MemoryUser[];
  sessions: Map<string, number>;
  items: Map<string, { list: MemoryItem[]; next: number }>; // per API server: each has its own memory
  cache: Map<string, { value: string; expires: number }>;
  turns: Map<string, number>; // round-robin position of each part that spreads requests
  index: Map<number, { title: string; body: string; owner: number }>; // the search index of a design without a database
};
const memories = new Map<string, Memory>();
function memoryOf(projectId: string): Memory {
  let memory = memories.get(projectId);
  if (!memory) {
    memory = { users: [], sessions: new Map(), items: new Map(), cache: new Map(), turns: new Map(), index: new Map() };
    memories.set(projectId, memory);
  }
  return memory;
}
// Forget a project's in-memory parts (tests; a deleted project).
export function forgetRun(projectId: string) {
  memories.delete(projectId);
}

// ---- Accounts (authCore.js) ----

type AppUser = { key: string | number; id: number; email: string }; // key: how it is stored; id: what the app shows

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${(await scrypt(password, salt, 32)).toString("hex")}`;
}
async function passwordMatches(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(await scrypt(password, Buffer.from(salt ?? "", "hex"), 32), Buffer.from(hash ?? "", "hex"));
}

class Accounts {
  constructor(
    private readonly projectId: string,
    private readonly memory: Memory,
    private readonly dbNode: string | null, // the database the auth part uses; null: memory
    private readonly cookiePath: string,
  ) {}

  cookie(token: string, maxAge = SESSION_DAYS * 86_400) {
    return `${COOKIE}=${encodeURIComponent(token)}; Path=${this.cookiePath}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  }

  private async newSession(user: AppUser, steps: Step[]) {
    const token = randomBytes(24).toString("base64url");
    const started = performance.now();
    if (this.dbNode) {
      await prisma.runSession.create({ data: { tokenHash: tokenHash(token), projectId: this.projectId, userId: String(user.key), expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) } });
      steps.push(step(this.dbNode, `Saved a new session for user #${user.id}.`, { ms: ms(started) }));
    } else {
      this.memory.sessions.set(tokenHash(token), user.id);
    }
    return token;
  }

  async signUpOrIn(kind: "signup" | "signin", input: Record<string, unknown>, authNode: string) {
    const steps: Step[] = [];
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";
    const problem = !EMAIL.test(email) ? "Enter a valid email address." : password.length < 8 || password.length > 200 ? "Use a password of 8 to 200 characters." : null;
    if (problem) return { status: 400, body: { error: problem }, steps: [step(authNode, `Rejected the form: ${problem}`, { ok: false })] };

    steps.push(step(authNode, kind === "signup" ? `Creating an account for ${email}.` : `Signing in ${email}.`));
    let started = performance.now();
    let existing: (AppUser & { passwordHash: string }) | null = null;
    if (this.dbNode) {
      const row = await prisma.runUser.findUnique({ where: { projectId_email: { projectId: this.projectId, email } } });
      existing = row ? { key: row.id, id: row.number, email: row.email, passwordHash: row.passwordHash } : null;
      steps.push(step(this.dbNode, existing ? `Found the account for ${email}.` : `No account for ${email} yet.`, { ms: ms(started) }));
    } else {
      const row = this.memory.users.find((user) => user.email === email);
      existing = row ? { key: row.id, id: row.id, email: row.email, passwordHash: row.passwordHash } : null;
    }

    if (kind === "signup") {
      if (existing) return { status: 409, body: { error: "That email already has an account. Sign in instead." }, steps: [...steps, step(authNode, "The email is taken.", { ok: false })] };
      started = performance.now();
      const hash = await hashPassword(password);
      steps.push(step(authNode, "Turned the password into a salted hash (scrypt), so the password itself is never stored.", { ms: ms(started) }));
      started = performance.now();
      let user: AppUser;
      if (this.dbNode) {
        const count = await prisma.runUser.count({ where: { projectId: this.projectId } });
        if (count >= MAX_USERS) return { status: 403, body: { error: `This app already has ${MAX_USERS} accounts, the most a design can have in ARCHITECH.` }, steps: [...steps, step(authNode, "Too many accounts.", { ok: false })] };
        const row = await withNextNumber((number) => prisma.runUser.create({ data: { projectId: this.projectId, number, email, passwordHash: hash } }), () => prisma.runUser.aggregate({ where: { projectId: this.projectId }, _max: { number: true } }).then((result) => result._max.number ?? 0));
        user = { key: row.id, id: row.number, email: row.email };
        steps.push(step(this.dbNode, `Saved user #${user.id}: the email and the password hash.`, { ms: ms(started) }));
      } else {
        if (this.memory.users.length >= MAX_USERS) return { status: 403, body: { error: `This app already has ${MAX_USERS} accounts.` }, steps: [...steps, step(authNode, "Too many accounts.", { ok: false })] };
        const row = { id: this.memory.users.length + 1, email, passwordHash: hash };
        this.memory.users.push(row);
        user = { key: row.id, id: row.id, email };
      }
      const token = await this.newSession(user, steps);
      steps.push(step(authNode, "Signed you in with a session cookie."));
      return { status: 201, body: { user: { id: user.id, email: user.email } }, token, steps };
    }

    if (!existing) return { status: 401, body: { error: "No account with that email. Create one first." }, steps: [...steps, step(authNode, "No such account.", { ok: false })] };
    started = performance.now();
    if (!(await passwordMatches(password, existing.passwordHash))) {
      return { status: 401, body: { error: "Wrong password." }, steps: [...steps, step(authNode, "Hashed the password you typed: it does not match the saved hash.", { ms: ms(started), ok: false })] };
    }
    steps.push(step(authNode, "Hashed the password you typed: it matches the saved hash.", { ms: ms(started) }));
    const token = await this.newSession(existing, steps);
    steps.push(step(authNode, "Signed you in with a session cookie."));
    return { status: 200, body: { user: { id: existing.id, email: existing.email } }, token, steps };
  }

  async userForToken(token: string | undefined, authNode: string): Promise<{ user: AppUser | null; steps: Step[] }> {
    if (!token) return { user: null, steps: [step(authNode, "No session cookie: not signed in.")] };
    const started = performance.now();
    if (this.dbNode) {
      const session = await prisma.runSession.findUnique({ where: { tokenHash: tokenHash(token) }, include: { user: true } });
      const valid = session && session.projectId === this.projectId && session.expiresAt > new Date() ? session.user : null;
      return {
        user: valid ? { key: valid.id, id: valid.number, email: valid.email } : null,
        steps: [step(authNode, valid ? `Checked the session cookie: signed in as ${valid.email}.` : "The session cookie is unknown or expired."), step(this.dbNode, "Looked up the session.", { ms: ms(started) })],
      };
    }
    const id = this.memory.sessions.get(tokenHash(token));
    const user = this.memory.users.find((candidate) => candidate.id === id);
    return { user: user ? { key: user.id, id: user.id, email: user.email } : null, steps: [step(authNode, user ? `Checked the session: signed in as ${user.email}.` : "Unknown session.")] };
  }

  async signOut(token: string | undefined, authNode: string): Promise<Step[]> {
    if (token) {
      if (this.dbNode) await prisma.runSession.deleteMany({ where: { tokenHash: tokenHash(token), projectId: this.projectId } });
      else this.memory.sessions.delete(tokenHash(token));
    }
    return [step(authNode, "Ended the session."), ...(this.dbNode && token ? [step(this.dbNode, "Deleted the session.")] : [])];
  }
}

// Numbers shown in the app (user #1, item #1) count up per project.
async function withNextNumber<T>(create: (number: number) => Promise<T>, highest: () => Promise<number>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await create((await highest()) + 1);
    } catch (error) {
      if (attempt < 4 && (error as { code?: string }).code === "P2002") continue; // two at once: try the next number
      throw error;
    }
  }
}

// ---- The app ----

type ItemRow = { number: number; title: string; body: string; status: string; wordCount: number | null; processedBy: string | null; processedAt: Date | null; fileName: string | null; createdAt: Date };
const fromRow = (row: ItemRow) => ({
  id: row.number, title: row.title, body: row.body, status: row.status, wordCount: row.wordCount, processedBy: row.processedBy,
  processedAt: row.processedAt, fileName: row.fileName, hasFile: Boolean(row.fileName), createdAt: row.createdAt,
});
const ITEM_FIELDS = { number: true, title: true, body: true, status: true, wordCount: true, processedBy: true, processedAt: true, fileName: true, createdAt: true } as const;

export class RunApp {
  private readonly memory: Memory;
  private readonly accounts: Accounts;
  private readonly addressOf: Map<string, string>;

  constructor(
    private readonly projectId: string,
    private readonly config: RunConfig,
    basePath: string,
  ) {
    this.memory = memoryOf(projectId);
    this.accounts = new Accounts(projectId, this.memory, config.auth.database, basePath);
    this.addressOf = new Map(Object.entries(config.addresses).map(([address, container]) => [container, address]));
  }

  // One request from the page, through the design's path, to an API server and back.
  async handle(request: RunRequest): Promise<RunResponse> {
    await this.runWorker();
    const headers: Record<string, string> = {};
    const before: Step[] = []; // steps of the parts in front of the API server (an auth part on the path)
    const path = this.config.path;
    let user: AppUser | null | undefined; // set by an auth part on the path
    let instance: string | null = null;

    for (let index = 1; index < path.length; index++) {
      const hop = path[index]!;
      if (hop.kind === "auth") {
        const token = cookies(request.headers.get("cookie"))[COOKIE];
        if (request.path.startsWith("/api/auth/")) {
          // The auth part answers sign-in itself; the request goes no further.
          const answer = await this.authRoutes(request, hop.node, token);
          return this.answer(answer.status, answer.body, [...before, ...answer.steps], { ...headers, ...answer.headers });
        }
        const checked = await this.accounts.userForToken(token, hop.node);
        if (!checked.user) {
          return this.answer(401, { error: "Sign in first." }, [...before, ...checked.steps, step(hop.node, "Stopped the request: only signed-in users get through.", { ok: false })], { ...headers, [`X-Trace-${hop.container}`]: "blocked" });
        }
        before.push(...checked.steps, step(hop.node, `Let the request through for ${checked.user.email}.`));
        user = checked.user;
      }
      if (hop.container && (hop.kind === "proxy" || hop.kind === "auth")) {
        // Sends the request on to the next part: looked up in the design's DNS when one is in
        // between; to the API servers in turn when they are next (NGINX's upstream).
        const forward = this.nextAfter(index);
        if (!forward) break;
        if (forward.server) instance = forward.server;
        headers[`X-Trace-${hop.container}`] = forward.address;
      }
    }

    instance ??= this.take("__direct", this.config.server.containers);
    const steps: Step[] = [step(this.config.server.node, `${instance} received ${request.method} ${request.path}.`)];
    try {
      const result = await this.api(request, instance, steps, user);
      return this.answer(result.status, result.json, [...before, ...steps], { ...headers, ...result.headers, "X-Trace-Api": instance }, result.bytes);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error(`run ${this.projectId}:`, error);
      return this.answer(status, { error: status === 413 ? "That is too large." : status === 500 ? "The API server failed." : error instanceof Error ? error.message : "Invalid request." }, [...before, ...steps, step(this.config.server.node, "Failed.", { ok: false })], { ...headers, "X-Trace-Api": instance });
    }
  }

  private answer(status: number, json: unknown, steps: Step[], headers: Record<string, string>, bytes?: Uint8Array): RunResponse {
    return bytes ? { status, bytes, headers } : { status, json, headers: { ...headers, "X-Trace-Steps": encodeSteps(steps), "Cache-Control": "no-store" } };
  }

  // Each part that spreads requests over the API servers takes turns, like NGINX does.
  private take(part: string, options: string[]) {
    const turn = this.memory.turns.get(part) ?? 0;
    this.memory.turns.set(part, turn + 1);
    return options[turn % options.length]!;
  }

  private nextAfter(index: number): { address: string; server?: string } | null {
    const hop = this.config.path[index]!;
    let viaDns = false;
    for (const candidate of this.config.path.slice(index + 1)) {
      if (candidate.kind === "dns") {
        viaDns = true;
        continue;
      }
      if (candidate.kind === "pass") continue;
      if (candidate.kind === "server") {
        const servers = this.config.server.containers;
        // A DNS answer for the API servers is one of their addresses, picked at random (as CoreDNS does).
        const server = viaDns ? servers[Math.floor(Math.random() * servers.length)]! : this.take(hop.container!, servers);
        return { address: `${this.addressOf.get(server) ?? server}:3000`, server };
      }
      return { address: `${this.addressOf.get(candidate.container!) ?? candidate.container}:80` };
    }
    return null;
  }

  // ---- Sign-in routes, wherever the design puts them ----

  private async authRoutes(request: RunRequest, authNode: string, token: string | undefined): Promise<{ status: number; body: unknown; steps: Step[]; headers: Record<string, string> }> {
    if (request.method === "POST" && (request.path === "/api/auth/signup" || request.path === "/api/auth/signin")) {
      const result = await this.accounts.signUpOrIn(request.path.endsWith("signup") ? "signup" : "signin", readJson(request), authNode);
      return { status: result.status, body: result.body, steps: result.steps, headers: result.token ? { "Set-Cookie": this.accounts.cookie(result.token) } : {} };
    }
    if (request.method === "POST" && request.path === "/api/auth/signout") {
      return { status: 200, body: { ok: true }, steps: await this.accounts.signOut(token, authNode), headers: { "Set-Cookie": this.accounts.cookie("", 0) } };
    }
    if (request.method === "GET" && request.path === "/api/auth/me") {
      const result = await this.accounts.userForToken(token, authNode);
      return { status: 200, body: { user: result.user ? { id: result.user.id, email: result.user.email } : null }, steps: result.steps, headers: {} };
    }
    return { status: 404, body: { error: "Not found." }, steps: [], headers: {} };
  }

  // ---- The API server (api.js) ----

  private async api(request: RunRequest, instance: string, steps: Step[], userOnPath: AppUser | null | undefined): Promise<{ status: number; json?: unknown; bytes?: Uint8Array; headers?: Record<string, string> }> {
    const { auth, data, server } = { auth: this.config.auth, data: this.config.data, server: this.config.server.node };
    const send = (status: number, json: unknown, headers: Record<string, string> = {}) => ({ status, json, headers });
    const token = cookies(request.headers.get("cookie"))[COOKIE];
    const path = request.path;

    if (path.startsWith("/api/auth/")) {
      if (auth.mode === "none") return send(404, { error: "This design has no authentication." });
      if (auth.mode === "service") {
        const started = performance.now();
        const answer = await this.authRoutes(request, auth.node!, token);
        steps.push(step(server, `Passed the request to the auth service (${ms(started)} ms).`), ...answer.steps);
        return send(answer.status, answer.body, answer.headers);
      }
      steps.push(step(server, "Handled sign-in itself (the design has no separate auth service)."));
      const answer = await this.authRoutes(request, server, token);
      steps.push(...answer.steps);
      return send(answer.status, answer.body, answer.headers);
    }
    if (path === "/api/health") return send(200, { ok: true, instance });

    // Who is asking.
    let user: AppUser | null;
    if (auth.mode === "none") user = null;
    else if (auth.mode === "on-path") user = userOnPath ?? null;
    else if (auth.mode === "service") {
      const started = performance.now();
      const checked = await this.accounts.userForToken(token, auth.node!);
      steps.push(step(server, `Asked the auth service who this is (${ms(started)} ms).`), ...checked.steps);
      user = checked.user;
    } else {
      const checked = await this.accounts.userForToken(token, server);
      steps.push(...checked.steps);
      user = checked.user;
    }
    if (auth.mode !== "none" && !user) return send(401, { error: "Sign in first." });
    const items = new Items(this.projectId, this.config, this.memory, instance, user);

    if (request.method === "GET" && path === "/api/items") {
      const query = request.query.get("q")?.trim() ?? "";
      if (query && data.search) return send(200, { items: await items.search(query, steps), query });
      const list = await items.list(steps);
      return send(200, { items: query ? list.filter((item) => `${item.title} ${item.body}`.toLowerCase().includes(query.toLowerCase())) : list, query });
    }
    if (request.method === "POST" && path === "/api/items") {
      const input = readItemInput(readJson(request));
      if ("error" in input) return send(400, { error: input.error });
      return send(201, { item: await items.create(input, steps) });
    }

    const match = /^\/api\/items\/(\d+)(\/process|\/file)?$/.exec(path);
    if (!match) return send(404, { error: "Not found." });
    const id = Number(match[1]);
    if (!(await items.exists(id))) return send(404, { error: "No such item." });

    if (match[2] === "/process" && request.method === "POST") {
      if (!data.queue) return send(400, { error: "This design has no queue." });
      await items.queue(id, steps);
      return send(202, { queued: true });
    }
    if (match[2] === "/file") {
      if (!data.storage) return send(400, { error: "This design has no object storage." });
      if (request.method === "PUT") {
        if (request.body.length > MAX_FILE) throw new HttpError(413, "That is too large.");
        const name = String(request.headers.get("x-file-name") ?? "file").replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "file";
        await items.attach(id, name, String(request.headers.get("content-type") ?? "application/octet-stream").slice(0, 100), request.body, steps);
        return send(200, { ok: true });
      }
      if (request.method === "GET") {
        const file = await items.file(id);
        if (!file) return send(404, { error: "No file on this item." });
        return {
          status: 200,
          bytes: file.data,
          headers: { "Content-Type": file.type, "Content-Disposition": `attachment; filename="${file.name.replace(/"/g, "")}"`, "X-Content-Type-Options": "nosniff" },
        };
      }
    }
    if (!match[2] && request.method === "PATCH") {
      const input = readItemInput(readJson(request));
      if ("error" in input) return send(400, { error: input.error });
      return send(200, { item: await items.update(id, input, steps) });
    }
    if (!match[2] && request.method === "DELETE") {
      await items.remove(id, steps);
      return send(200, { ok: true });
    }
    return send(405, { error: "Not allowed." });
  }

  // ---- The worker (worker.js): takes queued jobs once they have waited their turn ----
  // It runs whenever the app is used (the page asks every 1.5 s while something is queued), so
  // it needs no process of its own.
  async runWorker() {
    const { data } = this.config;
    if (!data.worker || !data.queue || !data.database) return; // without a database, as in Docker, the worker has nothing to save
    const due = await prisma.runItem.findMany({
      where: { projectId: this.projectId, status: "queued", queuedAt: { lte: new Date(Date.now() - WORK_MS) } },
      select: { id: true, body: true, ownerId: true, owner: { select: { number: true } } },
      take: 20,
    });
    for (const job of due) {
      const words = (job.body.match(/\S+/g) ?? []).length;
      const done = await prisma.runItem.updateMany({
        where: { id: job.id, status: "queued" },
        data: { status: "processed", wordCount: words, processedBy: "worker", processedAt: new Date() },
      });
      if (done.count > 0 && data.cache) this.memory.cache.delete(`items:${job.owner?.number ?? "everyone"}`);
    }
  }
}

function readItemInput(input: Record<string, unknown>): { title: string; body: string } | { error: string } {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body : "";
  if (!title || title.length > 200) return { error: "Give the item a title (up to 200 characters)." };
  if (body.length > 10_000) return { error: "Keep the text under 10,000 characters." };
  return { title, body };
}

// The items of one person (or everyone's, without authentication), as one API server sees them.
class Items {
  private readonly data: RunConfig["data"];
  private readonly server: string;
  private readonly owner: string | null; // run_users.id
  private readonly ownerNumber: number | null;

  constructor(
    private readonly projectId: string,
    config: RunConfig,
    private readonly memory: Memory,
    private readonly instance: string,
    user: AppUser | null,
  ) {
    this.data = config.data;
    this.server = config.server.node;
    this.owner = user && config.auth.database ? String(user.key) : null;
    this.ownerNumber = user?.id ?? null;
  }

  private get listKey() {
    return `items:${this.ownerNumber ?? "everyone"}`;
  }
  private get where() {
    return { projectId: this.projectId, ownerId: this.owner };
  }
  // Without a database, items live in this API server's memory (each server has its own).
  private get local() {
    let store = this.memory.items.get(this.instance);
    if (!store) {
      store = { list: [], next: 1 };
      this.memory.items.set(this.instance, store);
    }
    return store;
  }
  private mine(item: MemoryItem) {
    return item.owner === this.ownerNumber;
  }

  private forget(steps: Step[]) {
    if (!this.data.cache) return;
    const started = performance.now();
    this.memory.cache.delete(this.listKey);
    steps.push(step(this.data.cache.node, "Removed the cached item list, so the next read gets fresh data.", { ms: ms(started) }));
  }

  private index(item: { id: number; title: string; body: string }, steps: Step[]) {
    if (!this.data.search) return;
    const started = performance.now();
    if (!this.data.database) this.memory.index.set(item.id, { title: item.title, body: item.body, owner: this.ownerNumber ?? 0 });
    steps.push(step(this.data.search.node, `Indexed item #${item.id} so it can be searched.`, { ms: ms(started) }));
  }

  async list(steps: Step[]) {
    const cache = this.data.cache;
    if (cache) {
      const started = performance.now();
      const cached = this.memory.cache.get(this.listKey);
      if (cached && cached.expires > Date.now()) {
        steps.push(step(cache.node, "Cache hit: answered with the saved item list. The database was not asked.", { ms: ms(started), hit: true }));
        return JSON.parse(cached.value) as ReturnType<typeof fromRow>[];
      }
      steps.push(step(cache.node, "Cache miss: no saved item list yet.", { ms: ms(started), hit: false }));
    }
    let items: ReturnType<typeof fromRow>[];
    if (this.data.database) {
      const started = performance.now();
      const rows = await prisma.runItem.findMany({ where: this.where, orderBy: { number: "desc" }, take: 100, select: ITEM_FIELDS });
      items = rows.map(fromRow);
      steps.push(step(this.data.database.node, `Read ${items.length} item${items.length === 1 ? "" : "s"}.`, { ms: ms(started) }));
    } else {
      items = this.local.list
        .filter((item) => this.mine(item))
        .map((item) => ({ id: item.id, title: item.title, body: item.body, status: item.status, wordCount: null, processedBy: null, processedAt: null, fileName: item.fileName ?? null, hasFile: Boolean(item.fileData), createdAt: new Date(item.createdAt) }))
        .reverse();
      steps.push(step(this.server, `Read ${items.length} items from this server's memory (the design has no database).`));
    }
    if (cache) {
      const started = performance.now();
      this.memory.cache.set(this.listKey, { value: JSON.stringify(items), expires: Date.now() + 60_000 });
      steps.push(step(cache.node, "Saved the list in the cache for 60 seconds.", { ms: ms(started) }));
    }
    return items;
  }

  async search(query: string, steps: Step[]) {
    const search = this.data.search!;
    const started = performance.now();
    const needle = query.toLowerCase();
    let ids: number[];
    if (this.data.database) {
      const rows = await prisma.runItem.findMany({
        where: { ...this.where, OR: [{ title: { contains: query, mode: "insensitive" } }, { body: { contains: query, mode: "insensitive" } }] },
        orderBy: { number: "desc" },
        take: 50,
        select: { number: true },
      });
      ids = rows.map((row) => row.number);
    } else {
      ids = [...this.memory.index].filter(([, doc]) => doc.owner === (this.ownerNumber ?? 0) && `${doc.title} ${doc.body}`.toLowerCase().includes(needle)).map(([id]) => id);
    }
    steps.push(step(search.node, `Searched for “${query}”: ${ids.length} match${ids.length === 1 ? "" : "es"}.`, { ms: ms(started) }));
    if (ids.length === 0 || !this.data.database) return [];
    const read = performance.now();
    const rows = await prisma.runItem.findMany({ where: { ...this.where, number: { in: ids } }, select: ITEM_FIELDS });
    const items = ids.map((id) => rows.find((row) => row.number === id)).filter((row): row is (typeof rows)[number] => Boolean(row)).map(fromRow);
    steps.push(step(this.data.database.node, `Read the ${items.length} matching item${items.length === 1 ? "" : "s"}.`, { ms: ms(read) }));
    return items;
  }

  async exists(id: number) {
    if (this.data.database) return Boolean(await prisma.runItem.findFirst({ where: { ...this.where, number: id }, select: { id: true } }));
    return this.local.list.some((item) => item.id === id && this.mine(item));
  }

  async create(input: { title: string; body: string }, steps: Step[]) {
    let item: ReturnType<typeof fromRow> | MemoryItem;
    if (this.data.database) {
      if ((await prisma.runItem.count({ where: { projectId: this.projectId } })) >= MAX_ITEMS) throw new HttpError(403, `This app already has ${MAX_ITEMS} items, the most a design can have in ARCHITECH. Delete some first.`);
      const started = performance.now();
      const row = await withNextNumber(
        (number) => prisma.runItem.create({ data: { projectId: this.projectId, number, ownerId: this.owner, title: input.title, body: input.body }, select: ITEM_FIELDS }),
        () => prisma.runItem.aggregate({ where: { projectId: this.projectId }, _max: { number: true } }).then((result) => result._max.number ?? 0),
      );
      item = fromRow(row);
      steps.push(step(this.data.database.node, `Saved item #${item.id}.`, { ms: ms(started) }));
    } else {
      if (this.local.list.length >= MAX_ITEMS) throw new HttpError(403, `This server already holds ${MAX_ITEMS} items.`);
      item = { id: this.local.next++, owner: this.ownerNumber, title: input.title, body: input.body, status: "new", createdAt: new Date().toISOString() };
      this.local.list.push(item);
      steps.push(step(this.server, `Kept item #${item.id} in this server's memory.`));
    }
    this.forget(steps);
    this.index(item, steps);
    return "owner" in item ? { id: item.id, title: item.title, body: item.body, status: item.status, createdAt: item.createdAt } : item;
  }

  async update(id: number, input: { title: string; body: string }, steps: Step[]) {
    let item: { id: number; title: string; body: string };
    if (this.data.database) {
      const started = performance.now();
      await prisma.runItem.updateMany({ where: { ...this.where, number: id }, data: input });
      const row = await prisma.runItem.findFirstOrThrow({ where: { ...this.where, number: id }, select: ITEM_FIELDS });
      item = fromRow(row);
      steps.push(step(this.data.database.node, `Updated item #${id}.`, { ms: ms(started) }));
    } else {
      item = Object.assign(this.local.list.find((candidate) => candidate.id === id && this.mine(candidate))!, input);
    }
    this.forget(steps);
    this.index(item, steps);
    return item;
  }

  async remove(id: number, steps: Step[]) {
    if (this.data.database) {
      const started = performance.now();
      await prisma.runItem.deleteMany({ where: { ...this.where, number: id } });
      steps.push(step(this.data.database.node, `Deleted item #${id}.`, { ms: ms(started) }));
    } else {
      this.local.list = this.local.list.filter((item) => !(item.id === id && this.mine(item)));
    }
    this.forget(steps);
    if (this.data.search) {
      this.memory.index.delete(id);
      steps.push(step(this.data.search.node, `Removed item #${id} from the search index.`));
    }
  }

  async queue(id: number, steps: Step[]) {
    if (this.data.database) await prisma.runItem.updateMany({ where: { ...this.where, number: id }, data: { status: "queued", queuedAt: new Date(), queuedBy: this.instance } });
    const started = performance.now();
    steps.push(step(this.data.queue!.node, `Put a job for item #${id} on the queue. The API answers now; the worker does the work later.`, { ms: ms(started) }));
    this.forget(steps);
  }

  async attach(id: number, name: string, type: string, content: Uint8Array, steps: Step[]) {
    const started = performance.now();
    if (this.data.database) {
      await prisma.runItem.updateMany({ where: { ...this.where, number: id }, data: { fileName: name, fileType: type, fileData: Buffer.from(content) } });
      steps.push(step(this.data.storage!.node, `Stored “${name}” (${Math.ceil(content.length / 1024)} KB).`, { ms: ms(started) }));
      steps.push(step(this.data.database.node, `Saved where the file is on item #${id}.`));
    } else {
      Object.assign(this.local.list.find((item) => item.id === id && this.mine(item))!, { fileName: name, fileType: type, fileData: content });
      steps.push(step(this.data.storage!.node, `Stored “${name}” (${Math.ceil(content.length / 1024)} KB).`, { ms: ms(started) }));
    }
    this.forget(steps);
  }

  async file(id: number): Promise<{ name: string; type: string; data: Uint8Array } | null> {
    if (this.data.database) {
      const row = await prisma.runItem.findFirst({ where: { ...this.where, number: id }, select: { fileName: true, fileType: true, fileData: true } });
      return row?.fileData ? { name: row.fileName ?? "file", type: row.fileType ?? "application/octet-stream", data: new Uint8Array(row.fileData) } : null;
    }
    const item = this.local.list.find((candidate) => candidate.id === id && this.mine(candidate));
    return item?.fileData ? { name: item.fileName ?? "file", type: item.fileType ?? "application/octet-stream", data: item.fileData } : null;
  }
}
