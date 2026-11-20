import assert from "node:assert/strict";
import test from "node:test";

import { PREVIEW_BOX, computePreview } from "../src/components/projects/preview.ts";
import { DISCORD_PREVIEW, SPOTIFY_PREVIEW, YOUTUBE_PREVIEW } from "../src/components/breakdowns/upcoming.ts";
import { ARCHITECH_CONNECTIONS, ARCHITECH_NODES } from "../src/components/breakdowns/architech.ts";
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
    [ARCHITECH_NODES, ARCHITECH_CONNECTIONS],
    [YOUTUBE_PREVIEW.nodes, YOUTUBE_PREVIEW.edges],
    [SPOTIFY_PREVIEW.nodes, SPOTIFY_PREVIEW.edges],
    [DISCORD_PREVIEW.nodes, DISCORD_PREVIEW.edges],
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

// Every point a path visits, corners included: its runs are the straight lines between them.
function pathPoints(path: string): [number, number][] {
  const numbers = path.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const points: [number, number][] = [];
  for (let index = 0; index < numbers.length; index += 2) points.push([numbers[index]!, numbers[index + 1]!]);
  return points;
}

// No run of a link passes through a node other than its own two ends, and every run is straight.
function assertLinksClearNodes(preview: ReturnType<typeof computePreview>) {
  const half = PREVIEW_BOX / 2;
  for (const link of preview.links) {
    const points = pathPoints(link.path);
    for (let index = 1; index < points.length; index++) {
      const [x1, y1] = points[index - 1]!;
      const [x2, y2] = points[index]!;
      for (const other of preview.nodes) {
        if (other.id === link.source || other.id === link.target) continue;
        const crossesX = Math.min(x1, x2) < other.x + half - 0.5 && Math.max(x1, x2) > other.x - half + 0.5;
        const crossesY = Math.min(y1, y2) < other.y + half - 0.5 && Math.max(y1, y2) > other.y - half + 0.5;
        assert.ok(!(crossesX && crossesY), `${link.source}->${link.target} runs through ${other.id}`);
      }
    }
    assert.doesNotMatch(link.path, /C/, "links are straight runs, not curves");
    assert.match(link.arrow, /Z$/);
  }
}

test("a link skipping a column goes around the node between instead of through it", () => {
  const preview = computePreview(
    [node("a", "client"), node("b", "server"), node("c", "database")],
    [edge("a", "b"), edge("b", "c"), edge("a", "c")],
  );
  const skipping = preview.links.find((link) => link.source === "a" && link.target === "c");
  assert.ok(skipping);
  const b = find(preview, "b");
  assert.ok(pathPoints(skipping.path).some(([, y]) => Math.abs(y - b.y) > PREVIEW_BOX / 2), "leaves the row to pass b");
  assertLinksClearNodes(preview);
});

test("next-column links on one row are a single straight line", () => {
  const preview = computePreview([node("a", "client"), node("b", "server")], [edge("a", "b")]);
  const [link] = preview.links;
  assert.match(link!.path, /^M[\d.]+ [\d.]+L[\d.]+ [\d.]+$/);
});

test("breakdown and project previews route every link clear of other nodes", () => {
  for (const [nodes, edges] of [
    [NETFLIX_NODES, NETFLIX_CONNECTIONS],
    [ARCHITECH_NODES, ARCHITECH_CONNECTIONS],
    [YOUTUBE_PREVIEW.nodes, YOUTUBE_PREVIEW.edges],
    [SPOTIFY_PREVIEW.nodes, SPOTIFY_PREVIEW.edges],
    [DISCORD_PREVIEW.nodes, DISCORD_PREVIEW.edges],
  ] as const) {
    assertLinksClearNodes(computePreview(nodes, edges));
  }
  // Same column and backward links, from a cycle, still stay clear.
  assertLinksClearNodes(computePreview(
    [node("a", "client"), node("b", "server"), node("c", "database"), node("d", "cache")],
    [edge("a", "b"), edge("b", "c"), edge("c", "a"), edge("b", "d"), edge("d", "c"), edge("c", "b")],
  ));
});
