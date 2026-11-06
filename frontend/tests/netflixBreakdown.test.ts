import assert from "node:assert/strict";
import test from "node:test";

import {
  NETFLIX_COMPONENTS,
  NETFLIX_CONNECTIONS,
  NETFLIX_NODES,
  NETFLIX_SOURCES,
  NETFLIX_STEPS,
  netflixProgress,
  netflixScene,
  netflixStepIndex,
  netflixStepQuery,
} from "../src/components/breakdowns/netflix.ts";

test("every Netflix component is drawn and has a complete, sourced walkthrough step", () => {
  const ids = NETFLIX_COMPONENTS.map(component => component.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(NETFLIX_STEPS, [...ids, "review"]);
  assert.deepEqual(NETFLIX_NODES.map(node => node.id), ids);
  for (const component of NETFLIX_COMPONENTS) {
    for (const field of ["explanation", "why", "flow", "tradeoff"] as const) {
      assert.ok(component[field].trim().length > 40, `${component.id}: missing ${field}`);
    }
    assert.ok(component.sources.length > 0);
    for (const source of component.sources) assert.equal(new URL(NETFLIX_SOURCES[source].href).protocol, "https:");
    assert.ok(NETFLIX_CONNECTIONS.some(edge => edge.source === component.id || edge.target === component.id));
  }
});

test("connections have valid endpoints and video delivery bypasses application services", () => {
  const ids = new Set<string>(NETFLIX_COMPONENTS.map(component => component.id));
  assert.equal(new Set(NETFLIX_CONNECTIONS.map(edge => edge.id)).size, NETFLIX_CONNECTIONS.length);
  for (const edge of NETFLIX_CONNECTIONS) {
    assert.ok(ids.has(edge.source) && ids.has(edge.target), edge.id);
    assert.notEqual(edge.source, edge.target);
  }
  const video = NETFLIX_CONNECTIONS.filter(edge => edge.kind === "video");
  assert.ok(video.some(edge => edge.source === "cdn" && edge.target === "viewer"));
  assert.ok(video.some(edge => edge.source === "encoding" && edge.target === "assets"));
  assert.ok(video.some(edge => edge.source === "assets" && edge.target === "cdn"));
  assert.ok(video.every(edge => !["gateway", "discovery", "playback"].includes(edge.source) && !["gateway", "discovery", "playback"].includes(edge.target)));
});

test("shared walkthrough URLs round-trip every step without changing other parameters", () => {
  NETFLIX_STEPS.forEach((id, index) => {
    const query = netflixStepQuery("view=diagram", index);
    const params = new URLSearchParams(query);
    assert.equal(netflixStepIndex(params.get("step")), index);
    assert.equal(params.get("view"), "diagram");
    assert.equal(params.get("step"), index === 0 ? null : id);
  });
});

test("reset and invalid URLs never leave an out-of-range step", () => {
  for (const value of [null, "", "invalid", "__proto__", "<script>", "999", "Viewer"]) {
    assert.equal(netflixStepIndex(value), 0);
  }
  assert.equal(netflixStepQuery("step=cdn&step=cache&built=assets&view=diagram", 0, true), "?view=diagram");
  for (const index of [-1, 999, NaN, 1.5]) assert.equal(netflixStepQuery("", index), "");
});

test("the build starts with one node and adds exactly one at each component step", () => {
  assert.deepEqual(netflixProgress(null, null), { stepIndex: 0, revealedCount: 1 });
  NETFLIX_COMPONENTS.forEach((component, index) => {
    const progress = netflixProgress(component.id, null);
    const scene = netflixScene(progress.revealedCount);
    assert.equal(scene.nodes.length, index + 1);
    const visible = new Set(scene.nodes.map(node => node.id));
    assert.ok(scene.connections.every(edge => visible.has(edge.source) && visible.has(edge.target)));
    assert.deepEqual(scene.connections, NETFLIX_CONNECTIONS.filter(edge => visible.has(edge.source) && visible.has(edge.target)));
    if (index > 0) {
      assert.ok(scene.connections.some(edge => edge.source === component.id || edge.target === component.id), `${component.id} was added without a connection`);
    }
  });
  assert.equal(netflixScene(1).connections.length, 0);
  assert.equal(netflixProgress("review", null).revealedCount, NETFLIX_COMPONENTS.length);
});

test("delivery reports go through cache control before steering; file delivery points to the viewer", () => {
  assert.ok(NETFLIX_CONNECTIONS.some(edge => edge.source === "cdn" && edge.target === "cache-control" && edge.kind === "control"));
  assert.ok(NETFLIX_CONNECTIONS.some(edge => edge.source === "cache-control" && edge.target === "steering" && edge.kind === "control"));
  assert.ok(!NETFLIX_CONNECTIONS.some(edge => edge.source === "cdn" && edge.target === "steering"));
  assert.ok(!NETFLIX_CONNECTIONS.some(edge => edge.source === "viewer" && edge.target === "cdn" && edge.kind === "video"));
  for (const edge of NETFLIX_CONNECTIONS) assert.ok(edge.purpose.length > 8);
});

test("next always adds one new component, including when an earlier component is being inspected", () => {
  let query = "";
  for (let count = 2; count <= NETFLIX_COMPONENTS.length; count++) {
    query = netflixStepQuery(query, "next");
    const params = new URLSearchParams(query);
    const progress = netflixProgress(params.get("step"), params.get("built"));
    assert.equal(progress.revealedCount, count);
    assert.equal(progress.stepIndex, count - 1);
  }
  const revisiting = netflixStepQuery("step=cdn", 1);
  const resumed = new URLSearchParams(netflixStepQuery(revisiting, "next"));
  assert.equal(netflixProgress(resumed.get("step"), resumed.get("built")).revealedCount, 9);
  assert.equal(resumed.get("step"), "cache-control");
});

test("review and restart complete the sequence without retaining a hidden build frontier", () => {
  const lastId = NETFLIX_COMPONENTS.at(-1)!.id;
  const review = netflixStepQuery(`step=${lastId}`, "next");
  assert.equal(new URLSearchParams(review).get("step"), "review");
  assert.equal(netflixStepQuery(review, "next"), "");
  assert.equal(netflixStepQuery("step=cdn&built=encoding&view=diagram", "restart"), "?view=diagram");
  assert.deepEqual(netflixProgress("invalid", "review"), { stepIndex: 0, revealedCount: 1 });
  assert.equal(new URLSearchParams(netflixStepQuery("step=cdn", "previous")).get("step"), "steering");
});

test("revisiting a component keeps the built graph across navigation and refresh", () => {
  const query = netflixStepQuery("step=cdn", 2);
  const params = new URLSearchParams(query);
  assert.deepEqual(netflixProgress(params.get("step"), params.get("built")), { stepIndex: 2, revealedCount: 8 });
  const next = new URLSearchParams(netflixStepQuery(query, 3));
  assert.equal(netflixProgress(next.get("step"), next.get("built")).revealedCount, 8);
  assert.deepEqual(netflixProgress("bad", "bad"), { stepIndex: 0, revealedCount: 1 });
});
