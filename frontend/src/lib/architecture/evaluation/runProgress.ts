// How a run's progress ring fills. A real simulation does not advance evenly: it moves in
// bursts, settles on a hard part, then catches up. Each run gets its own plan of checkpoints,
// so no two runs fill the same way, and every plan reaches full exactly when the run ends.

export type ProgressPoint = { time: number; progress: number };

const MIN_POINTS = 3;
const MAX_POINTS = 6;

// A run's plan: checkpoints from (0, 0) to (1, 1), in time and in progress. Some segments are
// stalls (progress barely moves while time does) and some are bursts. `random` returns [0, 1).
export function progressPlan(random: () => number = Math.random): ProgressPoint[] {
  const count = MIN_POINTS + Math.floor(random() * (MAX_POINTS - MIN_POINTS + 1));
  const times = Array.from({ length: count }, () => 0.08 + random() * 0.84).sort((a, b) => a - b);
  const plan: ProgressPoint[] = [{ time: 0, progress: 0 }];
  let progress = 0;
  for (const time of times) {
    // About one step in four is a stall; the rest move a random share of what is left.
    const stall = random() < 0.25;
    const step = stall ? 0.01 + random() * 0.03 : (0.15 + random() * 0.45) * (1 - progress);
    progress = Math.min(0.94, progress + step);
    plan.push({ time, progress });
  }
  plan.push({ time: 1, progress: 1 });
  return plan;
}

// Progress, 0 to 1, at `time` (the share of the run's length that has passed), easing within
// each segment so the ring speeds up and slows down rather than ticking.
export function progressAt(plan: readonly ProgressPoint[], time: number): number {
  if (time <= 0) return 0;
  if (time >= 1) return 1;
  for (let index = 1; index < plan.length; index += 1) {
    const end = plan[index];
    if (time > end.time) continue;
    const start = plan[index - 1];
    const span = end.time - start.time;
    const local = span > 0 ? (time - start.time) / span : 1;
    const eased = local * local * (3 - 2 * local);
    return start.progress + (end.progress - start.progress) * eased;
  }
  return 1;
}
