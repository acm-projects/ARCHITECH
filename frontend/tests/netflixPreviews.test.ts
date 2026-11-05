import assert from "node:assert/strict";
import test from "node:test";

import { MAX_PREVIEW_MS, previewDurationMs } from "../src/components/breakdowns/livePreview.ts";
import { NETFLIX_CONNECTIONS, NETFLIX_STEPS } from "../src/components/breakdowns/netflix.ts";
import { NETFLIX_PREVIEWS } from "../src/components/breakdowns/netflixPreviews.ts";

const previews = Object.entries(NETFLIX_PREVIEWS);

test("every step of the walkthrough has its own preview", () => {
  assert.deepEqual(Object.keys(NETFLIX_PREVIEWS).sort(), [...NETFLIX_STEPS].sort());
  const openings = previews.map(([, frames]) => frames.map(frame => frame.caption).join("|"));
  assert.equal(new Set(openings).size, previews.length);
});

test("a preview only lights connections the diagram actually has", () => {
  const connections = new Set(NETFLIX_CONNECTIONS.map(connection => connection.id));
  for (const [id, frames] of previews) {
    for (const frame of frames) {
      assert.ok(frame.connections.length > 0, `${id}: "${frame.caption}" lights nothing`);
      for (const connection of frame.connections) assert.ok(connections.has(connection), `${id}: unknown connection ${connection}`);
    }
  }
});

test("a preview uses its own component's connections", () => {
  for (const [id, frames] of previews) {
    if (id === "review") continue;
    const touched = frames.flatMap(frame => frame.connections).some(connectionId => {
      const connection = NETFLIX_CONNECTIONS.find(item => item.id === connectionId);
      return connection?.source === id || connection?.target === id;
    });
    assert.ok(touched, `${id}: no frame uses this component's connections`);
  }
});

test("previews stop inside the five-second limit for unpausable motion", () => {
  for (const [id, frames] of previews) {
    assert.ok(previewDurationMs(frames) <= MAX_PREVIEW_MS, `${id} runs ${previewDurationMs(frames)} ms`);
    assert.ok(frames.length >= 2, `${id}: a single frame shows no change`);
  }
});

test("captions stay short so the visual leads", () => {
  for (const [id, frames] of previews) {
    for (const frame of frames) assert.ok(frame.caption.length <= 32, `${id}: "${frame.caption}" is too long`);
  }
});
