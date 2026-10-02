import assert from "node:assert/strict";
import test from "node:test";

import {
  createSharedProjectHash,
  parseSharedProjectHash,
} from "../src/lib/share.ts";

test("share links round-trip the current architecture", () => {
  const hash = createSharedProjectHash({
    name: "Checkout",
    mode: "challenge",
    state: {
      addedComponents: [{ id: "cache-1", name: "Redis" }],
      connections: [{ from: "service", to: "cache-1" }],
      readRatio: 80,
    },
  });
  const parsed = parseSharedProjectHash(hash);

  assert.equal(parsed?.name, "Checkout");
  assert.equal(parsed?.mode, "challenge");
  assert.equal(parsed?.state.readRatio, 80);
  assert.deepEqual(parsed?.state.addedComponents, [
    { id: "cache-1", name: "Redis" },
  ]);
});

test("share parser rejects malformed hashes", () => {
  assert.equal(parseSharedProjectHash("#share=not-valid-base64"), null);
  assert.equal(parseSharedProjectHash("#project-local-id"), null);
});
