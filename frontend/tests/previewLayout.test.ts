import assert from "node:assert/strict";
import test from "node:test";

import { PREVIEW_BOX, computePreview } from "../src/components/projects/preview.ts";
import { YOUTUBE_PREVIEW } from "../src/components/breakdowns/upcoming.ts";
import { NETFLIX_CONNECTIONS, NETFLIX_NODES } from "../src/components/breakdowns/netflix.ts";

type NodeType = "client" | "load-balancer" | "server" | "database" | "cache";

const node = (id: string, type: NodeType, x = 0, y = 0) => ({ id, data: { type }, position: { x, y } });
const edge = (source: string, target: string) => ({ source, target });
const find = (preview: ReturnType<typeof computePreview>, id: string) => {
  const match = preview.nodes.find((candidate) => candidate.id === id);
  assert.ok(match, `node ${id} is placed`);
  return match;
};

test("columns follow connections rather than saved positions", () => {
  const preview = computePreview(
    [node("db", "database", 0, 0), node("client", "client", 900, 500), node("api", "server", 400, 900)],
    [edge("client", "api"), edge("api", "db")],
  );
  assert.ok(find(preview, "client").x < find(preview, "api").x);
  assert.ok(find(preview, "api").x < find(preview, "db").x);
});

test("a node sits past its furthest upstream node", () => {
  const preview = computePreview(
    [node("a", "client"), node("b", "server"), node("c", "database")],
    [edge("a", "b"), edge("a", "c"), edge("b", "c")],
  );
  assert.ok(find(preview, "b").x < find(preview, "c").x);
});

test("interchangeable nodes collapse into one with a count", () => {
  const preview = computePreview(
    [
      node("lb", "load-balancer", 0, 0),
      node("api-1", "server", 200, 0),
      node("api-2", "server", 200, 100),
      node("api-3", "server", 200, 200),
      node("db", "database", 400, 100),
    ],
    [
      edge("lb", "api-1"), edge("lb", "api-2"), edge("lb", "api-3"),
      edge("api-1", "db"), edge("api-2", "db"), edge("api-3", "db"),
    ],
  );
  assert.equal(preview.nodes.length, 3);
  assert.equal(find(preview, "api-1").count, 3);
  assert.equal(preview.links.length, 2);
});

test("nodes of one type with different neighbors stay separate", () => {
  const preview = computePreview(
    [node("a", "server", 0, 0), node("b", "server", 0, 100), node("db", "database", 200, 0), node("cache", "cache", 200, 100)],
    [edge("a", "db"), edge("b", "cache")],
  );
  assert.equal(preview.nodes.length, 4);
  assert.ok(preview.nodes.every((placed) => placed.count === 1));
});

test("collapsing does not depend on node or edge order", () => {
  const nodes = [node("lb", "load-balancer"), node("a", "server", 0, 0), node("b", "server", 0, 100)];
  const edges = [edge("lb", "a"), edge("lb", "b")];
  const forward = computePreview(nodes, edges);
  const reversed = computePreview([...nodes].reverse(), [...edges].reverse());
  assert.deepEqual(reversed.nodes, forward.nodes);
});

test("cycles, self loops and repeated edges still place every node once", () => {
  const preview = computePreview(
    [node("a", "server", 0, 0), node("b", "server", 100, 0), node("c", "database", 200, 0)],
    [edge("a", "b"), edge("b", "c"), edge("c", "a"), edge("a", "a"), edge("a", "b"), edge("a", "missing")],
  );
  assert.equal(preview.nodes.length, 3);
  assert.equal(preview.links.length, 3);
  assert.equal(new Set(preview.nodes.map(({ x, y }) => `${x},${y}`)).size, 3);
});

test("no two nodes overlap and every link has a drawable path", () => {
  for (const [nodes, edges] of [
    [NETFLIX_NODES, NETFLIX_CONNECTIONS],
    [YOUTUBE_PREVIEW.nodes, YOUTUBE_PREVIEW.edges],
  ] as const) {
    const preview = computePreview(nodes, edges);
    for (const [index, a] of preview.nodes.entries()) {
      for (const b of preview.nodes.slice(index + 1)) {
        assert.ok(Math.abs(a.x - b.x) >= PREVIEW_BOX || Math.abs(a.y - b.y) >= PREVIEW_BOX, `${a.id} overlaps ${b.id}`);
      }
      assert.ok(a.x > 0 && a.x < preview.width && a.y > 0 && a.y < preview.height, `${a.id} is inside`);
    }
    for (const link of preview.links) assert.doesNotMatch(link.path, /NaN|Infinity/);
  }
});

test("a link running along a row arcs over the nodes between", () => {
  const preview = computePreview(
    [node("a", "client"), node("b", "server"), node("c", "database")],
    [edge("a", "b"), edge("b", "c"), edge("a", "c")],
  );
  const skipping = preview.links.find((link) => link.source === "a" && link.target === "c");
  const a = find(preview, "a");
  assert.ok(skipping);
  assert.match(skipping.path, new RegExp(`^M${a.x} ${a.y - PREVIEW_BOX / 2}C`));
});
