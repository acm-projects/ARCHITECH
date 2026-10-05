import assert from "node:assert/strict";
import test from "node:test";

import { evaluateChallenge } from "../src/screens/workspace/challengeModel.ts";

test("challenge requirements stay unmet before a stress test", () => {
  const result = evaluateChallenge({
    hasRun: false,
    effectiveTraffic: 15_000,
    p95Latency: 50,
    availability: 99.999,
    monthlyCost: 400,
  });

  assert.equal(result.metCount, 0);
  assert.equal(result.complete, false);
  assert.equal(result.requirements[0].value, "Run test");
});

test("challenge evaluation uses simulation outputs", () => {
  const result = evaluateChallenge({
    hasRun: true,
    effectiveTraffic: 12_400,
    p95Latency: 82,
    availability: 99.994,
    monthlyCost: 730,
  });

  assert.equal(result.metCount, 4);
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.requirements.map((requirement) => requirement.met),
    [true, true, true, true],
  );
});

test("challenge evaluation exposes unmet constraints", () => {
  const result = evaluateChallenge({
    hasRun: true,
    effectiveTraffic: 8_500,
    p95Latency: 130,
    availability: 99.95,
    monthlyCost: 920,
  });

  assert.equal(result.metCount, 0);
  assert.equal(result.complete, false);
});
