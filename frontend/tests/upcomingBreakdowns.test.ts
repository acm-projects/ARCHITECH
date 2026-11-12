import assert from "node:assert/strict";
import test from "node:test";

import { UBER_PREVIEW, YOUTUBE_PREVIEW } from "../src/components/breakdowns/upcoming.ts";
import { COMPONENT_CATALOG } from "../src/components/workspace/componentCatalog.ts";

for (const [name, preview] of [["Uber", UBER_PREVIEW], ["YouTube", YOUTUBE_PREVIEW]] as const) {
  test(`${name} card graph is well formed`, () => {
    const ids = new Set(preview.nodes.map((node) => node.id));
    assert.equal(ids.size, preview.nodes.length, "node ids are unique");
    for (const node of preview.nodes) {
      assert.ok(Object.hasOwn(COMPONENT_CATALOG, node.data.type), `${node.id} is a known component`);
    }
    for (const edge of preview.edges) {
      assert.ok(ids.has(edge.source) && ids.has(edge.target), `${edge.id} joins two nodes`);
    }
    const connected = new Set(preview.edges.flatMap((edge) => [edge.source, edge.target]));
    assert.equal(connected.size, ids.size, "every node is connected");
  });
}
