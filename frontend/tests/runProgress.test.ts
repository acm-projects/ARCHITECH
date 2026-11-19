import assert from "node:assert/strict";
import test from "node:test";

import { progressAt, progressPlan } from "../src/lib/architecture/evaluation/runProgress.ts";

// A seeded random source, so a plan can be checked exactly.
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

test("every plan starts empty, ends full, and never goes backwards", () => {
  for (let seed = 1; seed <= 50; seed += 1) {
    const plan = progressPlan(seeded(seed));
    assert.deepEqual(plan[0], { time: 0, progress: 0 });
    assert.deepEqual(plan.at(-1), { time: 1, progress: 1 });
    let previous = -1;
    for (let step = 0; step <= 100; step += 1) {
      const value = progressAt(plan, step / 100);
      assert.ok(value >= previous - 1e-12, `seed ${seed} went backwards at ${step}%`);
      assert.ok(value >= 0 && value <= 1);
      previous = value;
    }
    assert.equal(progressAt(plan, 1), 1);
  }
});

test("runs fill differently from one another, not in a straight line", () => {
  const halfway = new Set<number>();
  for (let seed = 1; seed <= 20; seed += 1) halfway.add(Math.round(progressAt(progressPlan(seeded(seed)), 0.5) * 100));
  assert.ok(halfway.size > 5, "different runs are at different points halfway through");
  assert.ok([...halfway].some((value) => Math.abs(value - 50) > 5), "the fill is not linear");
});
