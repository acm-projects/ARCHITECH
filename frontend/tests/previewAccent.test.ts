import assert from "node:assert/strict";
import test from "node:test";

import { selectPreviewAccent } from "../src/components/projects/preview.ts";

const nodes = [
  { id: "left", x: 20, y: 32 },
  { id: "hub", x: 100, y: 32 },
  { id: "right", x: 180, y: 32 },
];

test("the node connecting multiple parts of a preview is accented", () => {
  assert.equal(selectPreviewAccent(nodes, [
    { source: "left", target: "hub" },
    { source: "hub", target: "right" },
  ]), "hub");
});

test("equal connection counts prefer the visually central node", () => {
  assert.equal(selectPreviewAccent(nodes, [
    { source: "left", target: "hub" },
    { source: "hub", target: "right" },
    { source: "right", target: "left" },
  ]), "hub");
});

test("symmetric ties stay stable when node and edge ordering changes", () => {
  const symmetric = [{ id: "b", x: 0, y: 0 }, { id: "a", x: 20, y: 0 }];
  const edges = [{ source: "a", target: "b" }];
  assert.equal(selectPreviewAccent(symmetric, edges), "a");
  assert.equal(selectPreviewAccent([...symmetric].reverse(), [...edges].reverse()), "a");
});

test("dangling edges, repeated connections and self loops do not bias selection", () => {
  assert.equal(selectPreviewAccent(nodes, [
    { source: "left", target: "missing" },
    { source: "left", target: "left" },
    { source: "left", target: "hub" },
    { source: "left", target: "hub" },
    { source: "hub", target: "left" },
    { source: "hub", target: "right" },
  ]), "hub");
});

test("empty, single-node and disconnected previews have stable fallbacks", () => {
  assert.equal(selectPreviewAccent([], []), null);
  assert.equal(selectPreviewAccent([nodes[0]], []), "left");
  assert.equal(selectPreviewAccent(nodes, []), "hub");
});

test("selecting the accent leaves graph inputs untouched", () => {
  const frozenNodes = Object.freeze(nodes.map(node => Object.freeze({ ...node })));
  const frozenEdges = Object.freeze([Object.freeze({ source: "left", target: "hub" })]);
  const before = JSON.stringify({ nodes: frozenNodes, edges: frozenEdges });
  selectPreviewAccent(frozenNodes, frozenEdges);
  assert.equal(JSON.stringify({ nodes: frozenNodes, edges: frozenEdges }), before);
});
