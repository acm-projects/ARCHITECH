import assert from "node:assert/strict"
import test from "node:test"
import {
  LOOP_MS,
  sampleTimeline,
  connectorPath,
  archieLocalPoint,
  posePoint,
  sampleMapMotion,
  sampleBreakReaction,
  samplePlacement,
  sampleHandMotion,
  wireSnapTime,
  sampleWireMotion,
} from "../src/components/marketing/archie-hero/heroModel.ts"

const pathNumbers = (path: string) => path.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number)
const cubicPoint = (values: number[], t: number) => [0, 1].map(axis =>
  (1-t)**3 * values[axis] + 3*(1-t)**2*t * values[axis+2] +
  3*(1-t)*t*t * values[axis+4] + t**3 * values[axis+6])

test("hero cycles through three systems while Archie stays continuous", () => {
  const first = sampleTimeline(0)
  assert.deepEqual(sampleTimeline(LOOP_MS * 3), first)
  const cycles = [0, 1, 2].map(cycle => sampleTimeline(cycle * LOOP_MS))
  assert.equal(new Set(cycles.map(frame => frame.kinds.join())).size, 3)
  assert.equal(new Set(cycles.map(frame => frame.kinds[0])).size, 3)
  assert.equal(new Set(cycles.flatMap(frame => frame.kinds.slice(1))).size, 9)
  cycles.forEach(frame => assert.deepEqual(frame.sources, [0, 0, 0]))
  const last = sampleTimeline(LOOP_MS - 1)
  assert.ok(Math.abs(last.poses[4].x - first.poses[4].x) < 0.01)
  assert.ok(Math.abs(last.poses[4].y - first.poses[4].y) < 0.01)
  assert.ok(sampleMapMotion(LOOP_MS - 1).exit < .001)
  assert.ok(sampleMapMotion(0).nodes.every(node => node.opacity === 0))
})
test("all three phases preserve four nodes and Archie within the stage", () => {
  const seen = new Set<number>()
  for (let ms = 0; ms < LOOP_MS * 3; ms += 50) {
    const frame = sampleTimeline(ms)
    seen.add(frame.phase)
    assert.equal(frame.poses.length, 5)
    for (const pose of frame.poses) {
      assert.ok(pose.x >= 80 && pose.x <= 590)
      assert.ok(pose.y >= 40 && pose.y <= 430)
    }
    frame.sources.forEach((source, i) => {
      assert.doesNotMatch(connectorPath(frame.poses[source], frame.poses[i + 1]), /NaN|Infinity/)
    })
  }
  assert.deepEqual([...seen], [0, 1, 2])
})

test("hand contact survives the character's rotation and local asset scaling", () => {
  for (let time = 0; time < LOOP_MS; time += 75) {
    const frame = sampleTimeline(time)
    const contact = posePoint(frame.poses[0], -54, 24)
    const hand = archieLocalPoint(frame.poses[4], contact)
    const restored = posePoint(frame.poses[4], hand.x * .88 - 82, hand.y * .88 - 70)
    assert.ok(Math.hypot(restored.x - contact.x, restored.y - contact.y) < .00001)
  }
})

test("Archie's hand crosses the loop boundary without snapping or moving the old block", () => {
  const handAt = (elapsed: number) => {
    const frame = sampleTimeline(elapsed)
    const hand = sampleHandMotion(frame.time, frame.poses)
    return posePoint(frame.poses[4], hand.x * .88 - 82, hand.y * .88 - 70)
  }
  const before = handAt(LOOP_MS - 1)
  const after = handAt(LOOP_MS)
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) < .01)
  for (let time = 8500; time < LOOP_MS + 800; time += 16) {
    const from = handAt(time)
    const to = handAt(time + 16)
    assert.ok(Math.hypot(to.x - from.x, to.y - from.y) < 3)
  }
  const installed = sampleTimeline(8300).poses[0]
  for (let time = 8500; time < LOOP_MS; time += 25) {
    const frame = sampleTimeline(time)
    assert.deepEqual(frame.poses[0], installed)
    assert.equal(sampleHandMotion(time, frame.poses).inspection, 0)
  }
  const frame = sampleTimeline(0)
  const contact = posePoint(frame.poses[0], -54, 24)
  const hand = handAt(0)
  assert.ok(Math.hypot(hand.x - contact.x, hand.y - contact.y) < 17 * .88)
})
test("wire separates only after the pull and keeps both attached ends", () => {
  const before = sampleTimeline(3380)
  const after = sampleTimeline(3700)
  assert.equal(connectorPath(before.poses[0], before.poses[1], 3380).split("M").length, 2)
  assert.equal(connectorPath(after.poses[0], after.poses[1], 3700).split("M").length, 3)
})

test("each branch snaps separately and its outage starts at that snap", () => {
  for (let branch = 0; branch < 3; branch++) {
    const snap = wireSnapTime(branch)
    assert.equal(snap, 3450 + branch * 60)
    for (const time of [snap - 1, snap, snap + 100]) {
      const { poses } = sampleTimeline(time)
      const path = connectorPath(poses[0], poses[branch + 1], time, branch)
      assert.equal(path.split("M").length, time < snap ? 2 : 3)
      const outage = sampleMapMotion(time).nodes[branch + 1].outage
      assert.equal(outage > 0, time > snap)
    }
  }
})

test("snapping preserves the entire curve before either loose end recoils", () => {
  for (let branch = 0; branch < 3; branch++) {
    const snap = wireSnapTime(branch)
    const { poses } = sampleTimeline(snap)
    const intact = pathNumbers(connectorPath(poses[0], poses[branch + 1], snap - .001, branch))
    const split = pathNumbers(connectorPath(poses[0], poses[branch + 1], snap, branch))
    for (let step = 0; step <= 40; step++) {
      const t = step / 40
      const expected = cubicPoint(intact, t)
      const actual = t <= .5 ? cubicPoint(split.slice(0, 8), t * 2) : cubicPoint(split.slice(8), (t - .5) * 2)
      assert.ok(Math.hypot(actual[0] - expected[0], actual[1] - expected[1]) < .001)
    }
  }
})

test("loose ends recoil and curl apart while both ports stay attached", () => {
  for (let branch = 0; branch < 3; branch++) {
    const { poses } = sampleTimeline(4100)
    const intact = pathNumbers(connectorPath(poses[0], poses[branch + 1], 1700, branch))
    const tangent = [intact[4] + intact[6] - intact[0] - intact[2], intact[5] + intact[7] - intact[1] - intact[3]]
    const gaps: number[] = []
    for (const age of [0, 80, 160, 220, 360, 600]) {
      const split = pathNumbers(connectorPath(poses[0], poses[branch + 1], wireSnapTime(branch) + age, branch))
      assert.deepEqual(split.slice(0, 2), intact.slice(0, 2))
      assert.deepEqual(split.slice(-2), intact.slice(-2))
      const gap = [split[8] - split[6], split[9] - split[7]]
      gaps.push(Math.hypot(...gap))
      if (age >= 360) {
        assert.ok(gap[0] * tangent[0] + gap[1] * tangent[1] > 0)
        assert.ok(Math.abs(gap[0] * tangent[1] - gap[1] * tangent[0]) > 1)
      }
    }
    assert.equal(gaps[0], 0)
    assert.ok(gaps[1] > 0 && gaps[1] < gaps[2])
    assert.ok(gaps[2] > gaps[4] && gaps[3] > gaps[4])
    assert.ok(Math.abs(gaps[4] - Math.hypot(48, 28)) < .00001)
    assert.ok(Math.abs(gaps[4] - gaps[5]) < .00001)
  }
})

test("each destination gives one small reaction after its own wire snaps, then settles", () => {
  const installed = sampleTimeline(2500).poses
  for (let branch = 0; branch < 3; branch++) {
    const node = branch + 1
    const snap = wireSnapTime(branch)
    for (const time of [snap - 1, snap, snap + 60, snap + 360, 4200]) {
      assert.deepEqual(sampleTimeline(time).poses[node], installed[node])
    }
    assert.ok(Math.abs(sampleTimeline(snap + 210).poses[node].angle) >= 3)
    for (let time = snap; time < snap + 360; time += 16) {
      const from = sampleTimeline(time).poses[node]
      const to = sampleTimeline(time + 16).poses[node]
      assert.ok(Math.hypot(to.x - from.x, to.y - from.y) < 2)
      assert.ok(Math.abs(to.angle - from.angle) < 1)
    }
  }
})

test("recovery reconnects each branch, sends traffic, then restores its destination", () => {
  const restored: number[] = []
  for (const branch of [2, 0, 1]) {
    const { connectedAt, restoredAt } = sampleWireMotion(0, branch)
    restored.push(restoredAt)
    const before = sampleWireMotion(connectedAt - 1, branch)
    assert.equal(before.broken, true)
    assert.equal(before.operational, false)
    const connected = sampleWireMotion(connectedAt, branch)
    assert.equal(connected.broken, false)
    assert.equal(connected.operational, true)
    assert.equal(connected.returning, true)
    assert.equal(connected.packetProgress, 0)
    for (let time = connectedAt; time < restoredAt; time += 10) {
      const state = sampleWireMotion(time, branch)
      assert.equal(state.returning, true)
      assert.equal(state.outage, 1)
      assert.ok(state.packetProgress >= 0 && state.packetProgress < 1)
    }
    assert.equal(sampleWireMotion(restoredAt, branch).outage, 1)
    const brightening = sampleMapMotion(restoredAt + 80).nodes[branch + 1].outage
    assert.ok(brightening > 0 && brightening < 1)
    assert.equal(sampleMapMotion(restoredAt + 160).nodes[branch + 1].outage, 0)
  }
  assert.ok(restored[0] < restored[1] && restored[1] < restored[2])
  assert.ok(restored[0] > 6000 && restored[2] < 8200)
})

test("all system wires remain connected after Understand repairs them", () => {
  for (let cycle = 0; cycle < 3; cycle++) {
    for (let time = 8200; time < LOOP_MS; time += 50) {
      const frame = sampleTimeline(cycle * LOOP_MS + time)
      frame.sources.forEach((source, i) => {
        assert.equal(connectorPath(frame.poses[source], frame.poses[i + 1], time, i).split("M").length, 2)
      })
    }
  }
})

test("Understand leaves the completed system installed throughout the fade and reset", () => {
  const installed = sampleTimeline(1700).poses[0]
  for (let time = 6200; time < LOOP_MS; time += 25) {
    assert.deepEqual(sampleTimeline(time).poses[0], installed)
  }
  assert.equal(sampleMapMotion(8780).exit, 1)
  assert.ok(sampleMapMotion(0).nodes.every(node => node.opacity === 0))
})

test("each Build assembles its nodes before drawing attached wires", () => {
  for (let time = 0; time < 3000; time += 25) {
    const motion = sampleMapMotion(time)
    motion.wires.forEach((draw, i) => {
      if (draw > 0) {
        assert.ok(motion.nodes[i + 1].arrival > 0)
        for (let cycle = 0; cycle < 3; cycle++) {
          const frame = sampleTimeline(cycle * LOOP_MS + time)
          assert.equal(motion.nodes[frame.sources[i]].arrival, 1)
        }
      }
    })
  }
  assert.ok(sampleMapMotion(2600).nodes.every(node => node.opacity === 1))
  assert.ok(sampleMapMotion(2600).wires.every(draw => draw === 1))
})

test("Understand traces the top, middle, then bottom component in every system", () => {
  assert.deepEqual([6500, 7140, 7780].map(time => sampleMapMotion(time).branch), [2, 0, 1])
})

test("labels fade with the completed system and disappear when its component set changes", () => {
  assert.ok(sampleMapMotion(LOOP_MS - .001).nodes.every(node => node.labelOpacity < .00000001))
  assert.ok(sampleMapMotion(LOOP_MS % LOOP_MS).nodes.every(node => node.labelOpacity === 0))
  assert.equal(sampleMapMotion(7000).labelsOpacity, 1)
})

test("the loop has no empty tail or initial wait, and the completed diagram keeps carrying traffic", () => {
  for (let time = 1; time < LOOP_MS; time += 16) {
    assert.ok(sampleMapMotion(time).nodes.some(node => node.opacity > 0), `Empty scene at ${time}`)
  }
  for (let time = 8220; time <= 8780; time += 16) {
    const motion = sampleMapMotion(time)
    assert.ok(motion.wireMotion.every(wire => wire.operational && !wire.broken && wire.outage === 0))
    assert.ok(motion.nodes.every(node => node.labelOpacity === 1 && node.opacity === 1))
  }
})

test("component names appear as their own scan crosses the label and remain afterward", () => {
  for (let time = 0; time <= 6000; time += 25) {
    assert.ok(sampleMapMotion(time).nodes.every(node => node.labelOpacity === 0))
  }
  const inspections = [[0, 6000, 300], [3, 6720, 220], [1, 7360, 220], [2, 8000, 220]]
  for (const [node, start, duration] of inspections) {
    assert.equal(sampleMapMotion(start + duration * .57).nodes[node].labelOpacity, 0)
    const crossing = sampleMapMotion(start + duration * .7).nodes[node]
    assert.equal(crossing.focus, 1)
    assert.ok(crossing.labelOpacity > 0 && crossing.labelOpacity < 1)
    assert.equal(sampleMapMotion(start + duration).nodes[node].labelOpacity, 1)
    assert.equal(sampleMapMotion(8220).nodes[node].labelOpacity, 1)
  }
  assert.deepEqual(sampleMapMotion(6940).nodes.map(node => node.labelOpacity), [1, 0, 0, 1])
})

test("inspection hands the scan to each arriving packet while gaze leads the trace", () => {
  assert.equal(sampleMapMotion(6299).nodes[0].focus, 1)
  assert.equal(sampleMapMotion(6300).tracing, true)
  for (const [step, node] of [3, 1, 2].entries()) {
    const start = 6300 + step * 640
    assert.ok(sampleMapMotion(start - 40).gazeProgress > 0)
    assert.equal(sampleMapMotion(start - 40).gazeTo, node)
    assert.equal(sampleMapMotion(start + 419).nodes[node].focus, 0)
    assert.equal(sampleMapMotion(start + 420).nodes[node].focus, 1)
    assert.equal(sampleMapMotion(start + 639).nodes[node].focus, 1)
  }
})

test("Build places the main node once without a second settling motion", () => {
  const installed = sampleTimeline(800).poses[0]
  for (let time = 800; time <= 2500; time += 25) {
    assert.deepEqual(sampleTimeline(time).poses[0], installed)
    assert.equal(sampleMapMotion(time).nodes[0].lift, 0)
  }
})

test("Archie holds the block until its single placement finishes, then releases once", () => {
  for (let time = 0; time <= 800; time += 25) assert.equal(samplePlacement(time), 1)
  let previous = 1
  for (let time = 800; time <= 2500; time += 25) {
    const grip = samplePlacement(time)
    assert.ok(grip <= previous)
    previous = grip
  }
  assert.equal(samplePlacement(1000), 0)
})

test("disconnecting the held node stops traffic and cascades an outage before recovery", () => {
  assert.equal(sampleMapMotion(3400).operational, true)
  assert.equal(sampleMapMotion(3450).operational, false)
  const cascade = sampleMapMotion(3650).nodes.slice(1).map(node => node.outage)
  assert.ok(cascade[0] > cascade[1] && cascade[1] > cascade[2])
  assert.ok(sampleMapMotion(4500).nodes.slice(1).every(node => node.outage === 1))
  assert.equal(sampleMapMotion(4500).queueLoad, 1)
  for (let time = 8200; time < LOOP_MS; time += 50) {
    assert.ok(sampleMapMotion(time).nodes.every(node => node.outage === 0))
    assert.equal(sampleMapMotion(time).queueLoad, 0)
  }
})

test("inspection gaze moves from the top node to the middle and bottom", () => {
  assert.deepEqual([6500, 7140, 7780].map(time => sampleMapMotion(time).gazeTo), [3, 1, 2])
})

test("Archie notices the snap before checking nodes from top to bottom", () => {
  assert.equal(sampleBreakReaction(3300).gazeTo, 0)
  assert.equal(sampleBreakReaction(wireSnapTime() + 84).gazeTo, 0)
  assert.equal(sampleBreakReaction(wireSnapTime() + 85).gazeTo, -1)
  assert.equal(sampleBreakReaction(3600).gazeTo, -1)
  assert.deepEqual([4000, 4360, 4600].map(time => sampleBreakReaction(time).gazeTo), [3, 1, 2])
  assert.equal(sampleBreakReaction(4800).stage, "check-source")
  assert.ok(sampleBreakReaction(3600).x < 0 && sampleBreakReaction(3600).y < 0)
  assert.ok(sampleBreakReaction(4650).angle > 0)
  for (const time of [0, 2499, 5800, 7000, LOOP_MS - 1]) {
    const reaction = sampleBreakReaction(time)
    assert.equal(reaction.active, false)
    assert.deepEqual([reaction.x, reaction.y, reaction.angle].map(value => Math.abs(value)), [0, 0, 0])
  }
})


test("box settling starts and ends without an abrupt velocity change", () => {
  for (const index of [1, 2, 3]) {
    const start = 550 + index * 450
    assert.equal(sampleMapMotion(start).nodes[index].lift, 0)
    assert.ok(sampleMapMotion(start + 1).nodes[index].lift < .001)
    assert.equal(sampleMapMotion(start + 200).nodes[index].lift, 8)
    assert.ok(sampleMapMotion(start + 399).nodes[index].lift < .001)
    assert.equal(sampleMapMotion(start + 400).nodes[index].lift, 0)
  }
})

test("recovering wire fragments converge to the intact curve without a shape snap", () => {
  const poses = sampleTimeline(6000).poses
  for (const [branch, target] of poses.slice(1, 4).entries()) {
    const { connectedAt } = sampleWireMotion(0, branch)
    const recovering = pathNumbers(connectorPath(poses[0], target, connectedAt - .01, branch))
    const connected = pathNumbers(connectorPath(poses[0], target, connectedAt, branch))
    for (let step = 0; step <= 20; step++) {
      const t = step / 20
      const actual = t <= .5 ? cubicPoint(recovering.slice(0, 8), t*2) : cubicPoint(recovering.slice(8), (t-.5)*2)
      const expected = cubicPoint(connected, t)
      assert.ok(Math.hypot(actual[0]-expected[0], actual[1]-expected[1]) < .001)
    }
  }
})

test("Break holds every severed connection and outage until Understand inspects it", () => {
  for (let time = 4000; time <= 6300; time += 25) {
    const { poses } = sampleTimeline(time)
    sampleMapMotion(time).wireMotion.forEach((wire, branch) => {
      assert.equal(wire.broken, true)
      assert.equal(wire.operational, false)
      assert.equal(wire.recovery, 0)
      assert.equal(wire.outage, 1)
      assert.equal(connectorPath(poses[0], poses[branch + 1], time, branch).split("M").length, 3)
    })
  }
  for (const branch of [2, 0, 1]) {
    const { repairStart } = sampleWireMotion(0, branch)
    assert.equal(sampleMapMotion(repairStart).branch, branch)
    assert.ok(sampleWireMotion(repairStart + 100, branch).recovery > 0)
    assert.equal(sampleMapMotion(repairStart).nodes[branch + 1].labelOpacity, 0)
  }
})
