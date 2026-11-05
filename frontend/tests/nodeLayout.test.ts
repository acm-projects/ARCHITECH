import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ARCHITECTURE_NODE_SIZE, spreadOverlappingNodes } from "../src/lib/architecture/nodeLayout.ts";
import { STARTER_NODES } from "../src/components/projects/starterArchitecture.ts";
import { COLUMN_WIDTH, ROW_HEIGHT } from "../src/lib/github/buildDesign.ts";

const { width: W, height: H } = ARCHITECTURE_NODE_SIZE;
const at = (x: number, y: number) => ({ position: { x, y } });
const overlaps = (nodes: { position: { x: number; y: number } }[]) =>
  nodes.some((a, i) => nodes.slice(i + 1).some((b) =>
    Math.abs(a.position.x - b.position.x) < W && Math.abs(a.position.y - b.position.y) < H));

test("a layout with no overlaps is returned untouched", () => {
  const nodes = [at(0, 0), at(W, 0), at(0, H)];
  assert.equal(spreadOverlappingNodes(nodes), nodes);
  assert.equal(spreadOverlappingNodes([]).length, 0);
});

test("a layout spaced for the previous 82×27 node opens without overlaps", () => {
  const legacy = [at(140, 80), at(320, 80), at(500, 80), at(320, 120), at(140, 200)];
  assert.equal(overlaps(legacy), true);
  assert.equal(overlaps(spreadOverlappingNodes(legacy)), false);
});

test("the tightest legal previous layout still clears", () => {
  const legacy = [at(0, 0), at(82, 0), at(164, 0), at(0, 27), at(82, 27)];
  assert.equal(overlaps(spreadOverlappingNodes(legacy)), false);
});

test("spreading keeps the arrangement and settles after one pass", () => {
  const legacy = [at(100, 100), at(250, 100), at(250, 130)];
  const spread = spreadOverlappingNodes(legacy);
  const ratio = spread[1].position.x / legacy[1].position.x;
  assert.ok(ratio > 1);
  assert.ok(Math.abs(spread[0].position.x / legacy[0].position.x - ratio) < 0.02);
  assert.ok(Math.abs(spread[2].position.y / legacy[2].position.y - ratio) < 0.02);
  assert.equal(spreadOverlappingNodes(spread), spread);
});

test("stacked components have a bounded spread and leave the source untouched", () => {
  const legacy = [at(100, 100), at(100, 100), at(1000, 1000)];
  const spread = spreadOverlappingNodes(legacy);
  assert.ok(spread[2].position.x <= 3000);
  assert.equal(legacy[2].position.x, 1000);
});

test("positions not yet placed do not affect the spread", () => {
  const nodes = [at(Number.NaN, Number.NaN), at(0, 0)];
  assert.equal(spreadOverlappingNodes(nodes), nodes);
});

test("the starter graph and imported designs fit the node size as generated", () => {
  assert.equal(overlaps(STARTER_NODES.map((node) => ({ position: node.position }))), false);
  assert.ok(COLUMN_WIDTH >= W);
  assert.ok(ROW_HEIGHT >= H);
});

test("breakdowns have no node or edge drawing of their own", () => {
  const stylesheet = readFileSync("src/components/breakdowns/breakdowns.css", "utf8");
  assert.doesNotMatch(stylesheet, /\.ax-node(-[a-z]+)?\s*\{/);
  const breakdown = readFileSync("src/components/breakdowns/NetflixBreakdown.tsx", "utf8");
  assert.doesNotMatch(breakdown, /MarkerType|BaseEdge|strokeWidth/);
  assert.match(breakdown, /ArchitectureEdge/);
  assert.match(breakdown, /<ArchitectureNode /);
});
