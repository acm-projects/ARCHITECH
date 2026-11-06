// The design's background worker: takes jobs off the queue and processes items (counts their
// words, after a short pause standing in for real work), then marks them processed.

import { createClient } from "redis";

import { config, db, env, SELF, sleep, waitFor } from "./common.js";

const queue = createClient({ url: env("QUEUE_URL") });
const cache = env("CACHE_URL") ? createClient({ url: env("CACHE_URL") }) : null;
for (const client of [queue, cache]) client?.on("error", () => undefined);

await waitFor("queue", () => queue.connect());
if (cache) await waitFor("cache", () => cache.connect());
if (db) await waitFor("database", () => db.query("SELECT 1 FROM items LIMIT 1"));
console.log(`${SELF} (worker for ${config.data.worker?.label ?? "jobs"}) waiting for jobs`);

for (;;) {
  const next = await queue.brPop("jobs", 0);
  if (!next) continue;
  let job;
  try {
    job = JSON.parse(next.element);
  } catch {
    continue;
  }
  await sleep(1500);
  if (!db) continue;
  const row = (await db.query("SELECT body FROM items WHERE id = $1", [job.itemId])).rows[0];
  if (!row) continue;
  const words = (row.body.match(/\S+/g) ?? []).length;
  await db.query(
    "UPDATE items SET status = 'processed', word_count = $1, processed_by = $2, processed_at = now(), updated_at = now() WHERE id = $3",
    [words, SELF, job.itemId],
  );
  if (cache) await cache.del(`items:${job.ownerId ?? "everyone"}`);
  console.log(`${SELF}: processed item ${job.itemId} (${words} words), ${Date.now() - job.at} ms after it was queued`);
}
