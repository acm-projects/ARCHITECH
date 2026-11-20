export const HERO_INK_FPS = 12

// Position of the recording in the 650 x 500 scene, shared by video and canvas.
export const heroVideoLayout = { x: -16, y: 102.5, width: 395.851852, sourceWidth: 668, sourceHeight: 536 }

// Frame cadence and diagram sketches
// Stable sketches: pause/seek reproduces the same drawing without moving ports.
const outline = [[-46,-43],[-16,-43],[15,-43],[42,-43],[54,-31],[54,0],[54,27],[42,39],[10,39],[-20,39],[-46,39],[-58,27],[-58,0],[-58,-30]]
export function sketchNode(frame: number, node: number) {
  let seed = (frame + 1) * 997 + (node + 1) * 7919
  const jitter = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return (seed / 4294967296 - .5) * 2.6
  }
  const points = outline.map(([x,y], i) => i === 5 || i === 12 ? [x,y] : [x + jitter(), y + jitter()])
  const point = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`
  const middle = (a: number[], b: number[]) => point((a[0]+b[0])/2, (a[1]+b[1])/2)
  return `M${middle(points.at(-1)!, points[0])} ` + points.map((p,i) => `Q${point(p[0],p[1])} ${middle(p,points[(i+1)%points.length])}`).join(" ") + " Z"
}

// Story timeline and poses
export const LOOP_MS = 9000
export const nodeKinds = ["component", "processor", "database", "analytics"] as const
export const phases = [
  { name: "Build", color: "#0878ff" },
  { name: "Break", color: "#e99a13" },
  { name: "Understand", color: "#8250ef" },
] as const
export type Pose = {
  x: number
  y: number
  angle: number
  scale: number
}
const pose = (x: number, y: number, angle = 0, scale = 1): Pose => ({
  x,
  y,
  angle,
  scale,
})
export type NodeKind = "component" | "processor" | "database" | "analytics" | "search" | "cache" | "queue" | "worker" | "api" | "storage" | "router" | "client"
export const nodeLabels: Record<NodeKind, string> = {
  component: "Gateway", processor: "Service", database: "Database", analytics: "Charts",
  search: "Search", cache: "Cache", queue: "Queue", worker: "Worker", api: "API", storage: "Storage",
  router: "Router", client: "Client",
}
// Different components share the same roomy one-to-three layout.
const systems: { kinds: [NodeKind, NodeKind, NodeKind, NodeKind]; sources: [number, number, number] }[] = [
  { kinds: ["component", "processor", "database", "analytics"], sources: [0, 0, 0] },
  { kinds: ["router", "cache", "queue", "search"], sources: [0, 0, 0] },
  { kinds: ["client", "api", "storage", "worker"], sources: [0, 0, 0] },
]
const inspectionOrder = [3, 1, 2] // Top, middle, bottom in every component set.
const inspectStart = 6300
const branchDuration = 640
const systemExitStart = 8780
const nodeKicks = [pose(4, -2, 4), pose(3, 4, -3), pose(2, -3, -3)]
const frames = [
  { t: 0, poses: [pose(285, 265, -8), pose(495, 195), pose(490, 355), pose(365, 70), pose(138, 275, -4)] },
  { t: 800, poses: [pose(310, 245), pose(495, 195), pose(490, 355), pose(365, 70), pose(148, 265)] },
  { t: 1400, poses: [pose(310, 245), pose(495, 195), pose(490, 355), pose(365, 70), pose(148, 265)] },
  { t: 3050, poses: [pose(310, 245), pose(495, 195), pose(490, 355), pose(365, 70), pose(148, 265)] },
  { t: 3380, poses: [pose(275, 236, -12), pose(495, 195), pose(490, 355), pose(365, 70), pose(117, 265, -4)] },
  { t: 3500, poses: [pose(250, 230, -18), pose(495, 195), pose(490, 355), pose(365, 70), pose(105, 265, -6)] },
  { t: 3900, poses: [pose(250, 230, -16), pose(495, 195), pose(490, 355), pose(365, 70), pose(105, 265, -6)] },
  { t: 5200, poses: [pose(250, 230, -16), pose(495, 195), pose(490, 355), pose(365, 70), pose(105, 265, -6)] },
  { t: 6200, poses: [pose(310, 245), pose(505, 235), pose(455, 390), pose(350, 55), pose(125, 280, 8)] },
  { t: 8300, poses: [pose(310, 245), pose(505, 235), pose(455, 390), pose(350, 55), pose(125, 280, 8)] },
  // Archie eases toward the next build while the completed system fades in place.
  // Reset the nodes' layout only while invisible.
  { t: LOOP_MS, poses: [pose(310, 245), pose(505, 235), pose(455, 390), pose(350, 55), pose(138, 275, -4)] },
]
export function sampleTimeline(elapsed: number) {
  const time = ((elapsed % LOOP_MS) + LOOP_MS) % LOOP_MS
  const systemIndex = ((Math.floor(elapsed / LOOP_MS) % systems.length) + systems.length) % systems.length
  const system = systems[systemIndex]
  const index = frames.findIndex((frame) => frame.t > time)
  const from = frames[index - 1]
  const to = frames[index]
  const progress = (time - from.t) / (to.t - from.t)
  const eased = progress * progress * (3 - 2 * progress)
  return {
    time,
    phase: Math.floor(time / 3000),
    systemIndex,
    kinds: system.kinds,
    sources: system.sources,
    poses: from.poses.map((start, i) => {
      const end = to.poses[i]
      const mix = (a: number, b: number) => a + (b - a) * eased
      // Each destination reacts only after its own wire has separated.
      const kick = nodeKicks[i - 1]
      const snap = wireSnapTime(i - 1)
      const reaction = kick && time > snap + 60 && time < snap + 360
        ? Math.sin(Math.PI * storyProgress(time, snap + 60, snap + 360)) ** 2 : 0
      return {
        x: mix(start.x, end.x) + (kick?.x ?? 0) * reaction,
        y: mix(start.y, end.y) + (kick?.y ?? 0) * reaction,
        angle: mix(start.angle, end.angle) + (kick?.angle ?? 0) * reaction,
        scale: mix(start.scale, end.scale),
      }
    }),
  }
}
export function posePoint(pose: Pose, x: number, y: number) {
  const angle = pose.angle * Math.PI / 180
  return { x: pose.x + (x * Math.cos(angle) - y * Math.sin(angle)) * pose.scale,
    y: pose.y + (x * Math.sin(angle) + y * Math.cos(angle)) * pose.scale }
}
export function archieLocalPoint(actor: Pose, point: { x: number; y: number }) {
  const angle = -actor.angle * Math.PI / 180
  const dx = (point.x - actor.x) / actor.scale
  const dy = (point.y - actor.y) / actor.scale
  return { x: (dx * Math.cos(angle) - dy * Math.sin(angle) + 82) / .88,
    y: (dx * Math.sin(angle) + dy * Math.cos(angle) + 70) / .88 }
}
export function wireSnapTime(branch = 0) {
  return 3450 + branch * 60
}
export function sampleWireMotion(time: number, branch = 0) {
  const snap = wireSnapTime(branch)
  const repairStart = inspectStart + inspectionOrder.indexOf(branch + 1) * branchDuration
  const connectedAt = repairStart + 260
  const restoredAt = connectedAt + 160
  return {
    repairStart,
    connectedAt,
    restoredAt,
    recovery: storyProgress(time, repairStart, connectedAt),
    broken: time >= snap && time < connectedAt,
    operational: time < snap || time >= connectedAt,
    returning: time >= connectedAt && time < restoredAt,
    packetProgress: Math.max(0, Math.min(1, (time - connectedAt) / (restoredAt - connectedAt))),
    // The returning packet reaches its destination before that node brightens.
    outage: storyProgress(time, snap, snap + 270) * (1 - storyProgress(time, restoredAt, restoredAt + 160)),
  }
}
const breakReactionStart = wireSnapTime() + 85
type Point = [number, number]
function mixPoint(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}
export function connectorPath(from: Pose, to: Pose, time = 1700, branch = 0) {
  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)
  const vertical = dy > dx || (dx < 130 && dy > 85)
  const start = posePoint(from, vertical ? 0 : 58, vertical ? (to.y < from.y ? -43 : 43) : 0)
  const end = posePoint(to, vertical ? 0 : -58, vertical ? (to.y < from.y ? 43 : -43) : 0)
  const snap = wireSnapTime(branch)
  const motion = sampleWireMotion(time, branch)
  // Pull the curve taut, then release the strain without changing its shape at the snap.
  const tension = storyProgress(time, 3050, snap) * (1 - storyProgress(time, snap, snap + 220)) * .55
  const mx = (start.x + end.x) / 2
  const my = (start.y + end.y) / 2
  const a: Point = [start.x, start.y]
  const d: Point = [end.x, end.y]
  const b = mixPoint(vertical ? [start.x, my] : [mx, start.y], mixPoint(a, d, 1 / 3), tension)
  const c = mixPoint(vertical ? [end.x, my] : [mx, end.y], mixPoint(a, d, 2 / 3), tension)
  if (motion.broken) {
    const age = time - snap
    // One quick release, a small overshoot, then stillness until recovery.
    const release = storyProgress(age, 0, 100) + .18 * Math.sin(Math.PI * storyProgress(age, 50, 320))
    const gap = 24 * release * (1 - motion.recovery)
    // De Casteljau subdivision keeps both halves on the original cubic at separation
    // and reconnection. The outer controls stay fixed to preserve the port tangents.
    const ab = mixPoint(a, b, .5), bc = mixPoint(b, c, .5), cd = mixPoint(c, d, .5)
    const abc = mixPoint(ab, bc, .5), bcd = mixPoint(bc, cd, .5)
    const middle = mixPoint(abc, bcd, .5)
    const tangent = [bcd[0] - abc[0], bcd[1] - abc[1]]
    const length = Math.max(.001, Math.hypot(...tangent))
    // Released ends curl away from one another instead of sliding on rails.
    // Collapse both the recoil and curl during repair to recover the exact cubic.
    const curl = 14 * storyProgress(age, 0, 180) * (1 - motion.recovery)
    const shift = (point: Point, amount: number, bend = 0) =>
      `${point[0] + (tangent[0] * amount - tangent[1] * bend) / length} ${point[1] + (tangent[1] * amount + tangent[0] * bend) / length}`
    return `M${a.join(" ")} C${ab.join(" ")} ${shift(abc, -gap * .65, -curl * .35)} ${shift(middle, -gap, -curl)} M${shift(middle, gap, curl)} C${shift(bcd, gap * .65, curl * .35)} ${cd.join(" ")} ${d.join(" ")}`
  }
  return `M${a.join(" ")} C${b.join(" ")},${c.join(" ")},${d.join(" ")}`
}
export function storyProgress(time: number, start: number, end: number) {
  const value = Math.max(0, Math.min(1, (time - start) / (end - start)))
  return value * value * (3 - 2 * value)
}
export function samplePlacement(time: number) {
  // Hold the block throughout its single rise; release only after it is installed.
  return 1 - storyProgress(time, 800, 1000)
}

export function sampleHandMotion(time: number, poses: Pose[]) {
  const nodeContact = archieLocalPoint(poses[4], posePoint(poses[0], -54, 24))
  const breakGrip = storyProgress(time, 2600, 3000) * (1 - storyProgress(time, 5500, 5800))
  const touchNode = Math.max(samplePlacement(time), breakGrip)
  const grip = { x: 205 + (nodeContact.x - 205) * touchNode, y: 142 + (nodeContact.y - 142) * touchNode }
  const lensTarget = archieLocalPoint(poses[4], posePoint(poses[0], -48, 0))
  const raise = storyProgress(time, 5850, 6350)
  const lower = storyProgress(time, 7850, 8250)
  const inspection = raise * (1 - lower)
  const holdingGlass = storyProgress(time, 5500, 5800) * (1 - storyProgress(time, 8250, 8500))
  const lensX = 27 + (Math.max(27, lensTarget.x - 213) - 27) * inspection
  const lensY = 48 + (lensTarget.y - 85 - 48) * inspection
  const x = grip.x * (1 - holdingGlass) + (178 + lensX) * holdingGlass
  const y = grip.y * (1 - holdingGlass) + (139 + lensY) * holdingGlass
  // Prepare the next grip after the glass is down, without pulling the old node out.
  const nextContact = archieLocalPoint(poses[4], posePoint(frames[0].poses[0], -54, 24))
  const reset = storyProgress(time, 8500, LOOP_MS)
  return {
    x: Math.max(205, x + (nextContact.x - x) * reset),
    y: y + (nextContact.y - y) * reset,
    lensX,
    lensY,
    inspection,
  }
}

// Build assembles nodes and wires; Understand inspects top to bottom.
export function sampleBreakReaction(time: number) {
  // -1 targets the snapped wire; other targets are existing node indices.
  const beats = [
    { start: 2500, stage: "anticipate", from: 0, to: 0 },
    { start: breakReactionStart, stage: "recoil", from: 0, to: -1 },
    { start: 3800, stage: "check-top", from: -1, to: 3 },
    { start: 4160, stage: "check-middle", from: 3, to: 1 },
    { start: 4520, stage: "uh-oh", from: 1, to: 2 },
    { start: 4700, stage: "check-source", from: 2, to: 0 },
  ]
  const beat = beats.filter(beat => time >= beat.start).at(-1)
  const active = time >= 2500 && time < 5800
  const lean = storyProgress(time, 2750, 3050) * (1 - storyProgress(time, 3380, 3450))
  const recoil = time >= breakReactionStart && time < 3800 ? Math.sin((time - breakReactionStart) / (3800 - breakReactionStart) * Math.PI) ** 2 : 0
  const tilt = storyProgress(time, 4520, 4680) * (1 - storyProgress(time, 4700, 5200))
  return {
    active,
    stage: active ? beat!.stage : "idle",
    gazeFrom: beat?.from ?? 0,
    gazeTo: beat?.to ?? 0,
    gazeProgress: beat ? storyProgress(time, beat.start, beat.start + 160) : 0,
    x: -lean * 3 - recoil * 6,
    y: -recoil * 3,
    angle: -lean * 3 - recoil * 5 + tilt * 8,
  }
}
export function sampleMapMotion(time: number) {
  const build = time < 3000
  const step = Math.floor((time - inspectStart) / branchDuration)
  const tracing = time >= inspectStart && step < inspectionOrder.length
  const branch = tracing ? inspectionOrder[step] - 1 : -1
  const branchProgress = tracing ? (time - inspectStart) / branchDuration - step : 0
  const exit = 1 - storyProgress(time, systemExitStart, LOOP_MS)
  // Finish hiding names before changing the component set at the loop boundary.
  const labelsOpacity = storyProgress(time, 6000, 6200) * exit
  const wireMotion = [0, 1, 2].map(branch => sampleWireMotion(time, branch))
  const queueLoad = wireMotion[1].outage
  const activeStep = time < inspectStart - 80 ? -1 : Math.min(2, Math.floor((time - inspectStart + 80) / branchDuration))
  const gazeFrom = activeStep < 1 ? 0 : inspectionOrder[activeStep - 1]
  const gazeTo = activeStep < 0 ? 0 : inspectionOrder[activeStep]
  const gazeProgress = activeStep < 0 ? 0 : storyProgress(time, inspectStart + activeStep * branchDuration - 80, inspectStart + activeStep * branchDuration + 80)
  const nodes = [0, 1, 2, 3].map((index) => {
    const arrivalStart = index === 0 ? 0 : 150 + index * 450
    const arrival = storyProgress(time, arrivalStart, arrivalStart + (index === 0 ? 220 : 400))
    const activation = (time - (arrivalStart + 400)) / 400
    const waking = build && activation > 0 && activation < 1
    const scan = index === 0
      ? (time - 6000) / 300
      : (time - wireMotion[index - 1].restoredAt) / 220
    const scanning = time >= 6000 && scan >= 0 && scan <= 1
    const outage = index === 0 ? 0 : wireMotion[index - 1].outage
    return {
      arrival,
      opacity: arrival * exit,
      // Reveal the name as this tile's sweep crosses its text, then retain it
      // until the completed diagram exits. Uninspected tiles stay unnamed.
      labelOpacity: arrival * labelsOpacity * storyProgress(scan, .58, .82),
      outage,
      // Zero velocity at both ends avoids a kick when settling begins or ends.
      lift: waking && index > 0 ? Math.sin(activation * Math.PI) ** 2 * 8 : 0,
      activation: waking ? 1 - activation : 0,
      expansion: waking ? 1 + activation * .3 : 1,
      focus: scanning ? 1 : 0,
      // Sweep the full tile, then briefly hold at its bottom before disappearing.
      scanY: -43 + Math.max(0, Math.min(1, scan / .9)) * 82,
    }
  })
  const wires = [0, 1, 2].map((index) => storyProgress(time, 850 + index * 450, 1150 + index * 450))
  return { nodes, wires, wireMotion, exit, labelsOpacity, queueLoad, operational: wireMotion.every(wire => wire.operational), gazeFrom, gazeTo, gazeProgress, build, tracing, branch, branchProgress }
}

// Recorded media mapping
const SOURCE_DURATION = 110 / HERO_INK_FPS

// Landmarks in the supplied 110-frame, 12 fps recording. Keep its native
// cadence while aligning the diagram's placement, pull, and inspection beats.
const beats = [
  [0, 0], [1.25, 800], [3.25, 2500], [3.5, 3050],
  [4, 3500], [5.75, 5200], [6.75, 6200], [8.5, 8250],
  [SOURCE_DURATION, LOOP_MS],
] as const

export function mediaStoryTime(seconds: number, duration: number) {
  if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return 0
  const source = Math.max(0, Math.min(SOURCE_DURATION, seconds / duration * SOURCE_DURATION))
  const index = beats.findIndex(([time]) => time > source)
  if (index < 1) return source === 0 ? 0 : LOOP_MS - .001
  const [start, from] = beats[index - 1]
  const [end, to] = beats[index]
  return Math.min(LOOP_MS - .001, from + (to - from) * (source - start) / (end - start))
}

export function storyMediaTime(time: number, duration: number) {
  const index = beats.findIndex(([, story]) => story > time)
  if (index < 1) return time <= 0 ? 0 : duration
  const [start, from] = beats[index - 1]
  const [end, to] = beats[index]
  return (start + (end - start) * (time - from) / (to - from)) / SOURCE_DURATION * duration
}

// Fallback eye expressions
// Matching cubic contours let each filled expression blend without thin strokes.
const oval = [0, -11, 4.4, -11, 8, -6, 8, 0, 8, 6, 4.4, 11, 0, 11, -4.4, 11, -8, 6, -8, 0, -8, -3, -7.1, -6.5, -5.65, -8.1, -3.8, -10, -1.9, -11, 0, -11]
const happy = [0, -9, 6, -9, 11, -4, 11, 2, 11, 7, 7, 6, 6, 3, 2, -3, -2, -3, -6, 3, -7, 6, -11, 7, -11, 2, -11, -4, -6, -9, 0, -9]
const surprised = oval.map((value, i) => value * (i % 2 === 0 ? 1.18 : .86))

function eyePath(shape: number[], x: number) {
  const pairs = shape.map((value, i) => value + (i % 2 === 0 ? x : 67))
  let path = `M${pairs[0]} ${pairs[1]}`
  for (let i = 2; i < pairs.length; i += 6) path += `C${pairs.slice(i, i + 6).join(" ")}`
  return `${path}Z`
}

export function sampleEyeExpression(time: number) {
  const pleased = storyProgress(time, 1800, 2050) * (1 - storyProgress(time, 2450, 2650))
  const surprise = storyProgress(time, breakReactionStart, breakReactionStart + 160) * (1 - storyProgress(time, 4700, 5200))
  const curious = storyProgress(time, 6000, 6250) * (1 - storyProgress(time, 8150, 8400))
  const uneven = storyProgress(time, 4520, 4680) * (1 - storyProgress(time, 4700, 5200))
  const shape = oval.map((value, i) => value + (happy[i] - value) * pleased + (surprised[i] - value) * surprise)
  return {
    expression: pleased > .5 ? "happy" : surprise > .5 ? "surprised" : curious > .5 ? "curious" : "focused",
    left: eyePath(shape, 63),
    right: eyePath(shape, 134),
    tilt: curious * 8,
    uneven: uneven * 1.2,
  }
}
