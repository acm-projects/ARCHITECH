import {
  HERO_INK_FPS,
  LOOP_MS,
  archieLocalPoint,
  connectorPath,
  nodeKinds,
  nodeLabels,
  phases,
  posePoint,
  sampleBreakReaction,
  sampleEyeExpression,
  sampleHandMotion,
  sampleMapMotion,
  sampleTimeline,
  sketchNode,
  storyProgress,
} from "./heroModel.ts"

const buildGazeOrder = [0, 1, 2, 3, 0]
const nextBuildRoot = sampleTimeline(0).poses[0]

export type DiagramFrame = {
  seconds: number
  elapsed: number
  videoReady: boolean
  reducedMotion: boolean
}

/** Bind scene elements once; render only the supplied frame, without owning a clock. */
export function createDiagramPainter(root: HTMLElement) {
  const actors = [...nodeKinds, "archie"].map(
    (name) => root.querySelector<SVGGElement>(`[data-actor="${name}"]`)!,
  )
  const wires = Array.from(
    root.querySelectorAll<SVGPathElement>("[data-wire]"),
  )
  const flows = Array.from(
    root.querySelectorAll<SVGPathElement>("[data-flow]"),
  )
  const placementGuides = Array.from(root.querySelectorAll<SVGGElement>("[data-placement-guide]"))
  const nodeEffects = actors.slice(0, 4).map((actor) => ({
    activation: actor.querySelector<SVGRectElement>(".ah-node-activation")!,
    focus: actor.querySelector<SVGPathElement>(".ah-node-focus")!,
    scan: actor.querySelector<SVGPathElement>(".ah-node-scan")!,
    icons: Array.from(actor.querySelectorAll<SVGGElement>("[data-node-icon]")),
    iconGroup: actor.querySelector<SVGGElement>(".ah-node-icon")!,
    visual: actor.querySelector<SVGGElement>(".ah-node-visual")!,
    chart: actor.querySelector<SVGGElement>('[data-node-icon="analytics"] > g')!,
    backlog: actor.querySelector<SVGGElement>("[data-queue-backlog]")!,
    queueArrow: actor.querySelector<SVGPathElement>("[data-queue-arrow]")!,
  }))
  const diagramLabels = [
    { element: root.querySelector<HTMLElement>(".ah-label-component")!, node: 0 },
    { element: root.querySelector<HTMLElement>(".ah-label-analytics")!, node: 3 },
    { element: root.querySelector<HTMLElement>(".ah-label-processor")!, node: 1 },
    { element: root.querySelector<HTMLElement>(".ah-label-database")!, node: 2 },
  ]
  const labelGroup = root.querySelector<HTMLElement>(".ah-diagram-labels")!
  const inkNoise = root.querySelector<SVGFETurbulenceElement>("[data-ink-noise]")!
  const inkFaces = actors.slice(0, 4).map(actor => ({
    face: actor.querySelector<SVGPathElement>(".ah-node-face")!,
    side: actor.querySelector<SVGPathElement>(".ah-node-side")!,
  }))
  let lastInkFrame = -1
  const words = Array.from(root.querySelectorAll<HTMLElement>("[data-word]"))
  const shadow = root.querySelector<SVGEllipseElement>(".ah-ground-shadow")!
  const hand = root.querySelector<SVGCircleElement>(".ah-hand-right")!
  const magnifier = root.querySelector<SVGGElement>(".ah-magnifier")!
  const eyes = root.querySelector<SVGGElement>("[data-eyes]")!
  const leftEye = root.querySelector<SVGPathElement>('[data-eye="left"]')!
  const rightEye = root.querySelector<SVGPathElement>('[data-eye="right"]')!
  const sparkle = root.querySelector<SVGPathElement>(".ah-aha")!
  let lastPhase = -1
  let lastSystem = -1
  return ({ seconds, elapsed, videoReady, reducedMotion }: DiagramFrame) => {
    const inkFrame = reducedMotion ? 0 : Math.floor(seconds * HERO_INK_FPS + .0001)
    if (inkFrame !== lastInkFrame) {
      inkFaces.forEach(({ face, side }, index) => {
        const path = sketchNode(inkFrame, index)
        face.setAttribute("d", path)
        side.setAttribute("d", path)
      })
      inkNoise.setAttribute("seed", String(inkFrame + 1))
      lastInkFrame = inkFrame
    }
    const { time, phase, poses, sources, systemIndex, kinds } = sampleTimeline(
      (videoReady ? 2 * LOOP_MS : 0) + (reducedMotion ? 7000 : elapsed),
    )
    const motion = sampleMapMotion(time)
    const reaction = sampleBreakReaction(time)
    root.dataset.reaction = reducedMotion ? "idle" : reaction.stage
    if (!reducedMotion) {
      poses[4].x += reaction.x
      poses[4].y += reaction.y
      poses[4].angle += reaction.angle
    }
    // Hide the names before swapping their text or icons for the next cycle.
    labelGroup.style.opacity = "1"
    labelGroup.style.visibility = reducedMotion || motion.nodes.some(node => node.labelOpacity > 0) ? "visible" : "hidden"
    root.dataset.system = String(systemIndex)
    if (systemIndex !== lastSystem) {
      nodeEffects.forEach((effect, i) => {
        actors[i].dataset.kind = kinds[i]
        effect.icons.forEach(icon => { icon.style.display = icon.dataset.nodeIcon === kinds[i] ? "inline" : "none" })
      })
      diagramLabels.forEach(({ element, node }) => { element.textContent = nodeLabels[kinds[node]] })
      lastSystem = systemIndex
    }
    nodeEffects.forEach((effect, i) => {
      const state = motion.nodes[i]
      placementGuides[i].style.opacity = String(reducedMotion ? 0 : state.arrival * .24 * (1 - storyProgress(time, 2200, 2600)))
      if (!reducedMotion && i !== 0) {
        poses[i].y += (1 - state.arrival) * 18 - state.lift
        poses[i].scale *= .86 + .14 * state.arrival
      }
      actors[i].style.opacity = String(reducedMotion ? 1 : state.opacity)
      const outage = reducedMotion ? 0 : state.outage
      actors[i].dataset.status = outage > .5 ? "offline" : "ready"
      effect.visual.style.opacity = String(1 - outage * .45)
      effect.iconGroup.setAttribute("transform", `translate(0 ${-15 * motion.labelsOpacity}) scale(.72)`)
      effect.chart.setAttribute("transform", `translate(0 19) scale(1 ${1 - outage * .8}) translate(0 -19)`)
      effect.backlog.style.opacity = String(reducedMotion ? 0 : motion.queueLoad)
      effect.queueArrow.style.opacity = String(1 - outage)
      effect.activation.style.opacity = String(reducedMotion ? 0 : state.activation)
      effect.activation.setAttribute("transform", `scale(${state.expansion})`)
      effect.focus.style.opacity = String(reducedMotion ? 0 : state.focus)
      effect.scan.style.opacity = String(reducedMotion ? 0 : state.focus * .65)
      effect.scan.setAttribute("transform", `translate(0 ${state.scanY})`)
    })
    if (phase !== lastPhase) {
      root.dataset.phase = phases[phase].name.toLowerCase()
      root.style.setProperty("--ah-accent", phases[phase].color)
      lastPhase = phase
    }
    actors.forEach((actor, i) => {
      const p = poses[i]
      actor.setAttribute(
        "transform",
        `translate(${p.x} ${p.y}) rotate(${p.angle}) scale(${p.scale})`,
      )
    })
    // Names sit inside each tile during Understand.
    diagramLabels.forEach(({ element, node }) => {
      const anchor = posePoint(poses[node], -2, 27)
      element.style.left = `${anchor.x / 650 * 100}%`
      element.style.top = `${anchor.y / 500 * 100}%`
      element.style.transform = `translate(-50%, -100%) rotate(${poses[node].angle}deg)`
      element.style.opacity = String(reducedMotion ? 1 : motion.nodes[node].labelOpacity * (1 - motion.nodes[node].outage * .45))
    })
    const footCenter = posePoint(poses[4], 98.5 * .88 - 82, 184 * .88 - 70)
    const footLeft = posePoint(poses[4], 8 * .88 - 82, 184 * .88 - 70)
    const footRight = posePoint(poses[4], 189 * .88 - 82, 184 * .88 - 70)
    shadow.setAttribute("cx", String(footCenter.x))
    shadow.setAttribute("cy", String(Math.max(footLeft.y, footRight.y) + 12))
    shadow.setAttribute("rx", String(92 * poses[4].scale))
    wires.forEach((wire, i) => {
      const wireDraw = reducedMotion ? 1 : motion.wires[i]
      const source = sources[i]
      const state = motion.wireMotion[i]
      const outage = reducedMotion ? 0 : state.outage
      const path = connectorPath(poses[source], poses[i + 1], source === 0 && !reducedMotion ? time : 1700, i)
      wire.setAttribute("d", path)
      wire.style.stroke = `color-mix(in srgb, var(--hero-wire) ${100 - outage * 55}%, #647084)`
      wire.style.strokeWidth = String(2 + outage * .5)
      wire.style.opacity = String(wireDraw * (reducedMotion ? 1 : motion.exit))
      wire.style.strokeDasharray = wireDraw < 1 ? `${wireDraw * 100} 100` : "none"
      flows[i].setAttribute("d", path)
      // Build sends traffic on every branch. Understand traces one full branch,
      // then scans its node; the map itself stays still during inspection.
      const packet = state.returning
      const packetProgress = state.packetProgress
      flows[i].style.strokeDasharray = packet ? "14 114" : "7 26"
      flows[i].style.strokeDashoffset = String(packet ? 14 - packetProgress * 114 : -time / 18)
      const flowVisible = state.operational && wireDraw === 1
      flows[i].style.opacity = reducedMotion || !flowVisible ? "0" : String(motion.exit)
    })
    root.style.setProperty("--ah-wire-opacity", "1")

    const handMotion = sampleHandMotion(time, poses)
    magnifier.setAttribute("transform", `translate(${handMotion.lensX} ${handMotion.lensY})`)
    magnifier.style.opacity = String(handMotion.inspection)
    hand.setAttribute("cx", String(handMotion.x))
    hand.setAttribute("cy", String(handMotion.y))

    // Expressions share a solid rounded contour, with small changes in gaze.
    const local = time % 3000
    const expression = sampleEyeExpression(time)
    root.dataset.expression = expression.expression
    leftEye.setAttribute("d", expression.left)
    rightEye.setAttribute("d", expression.right)
    leftEye.setAttribute("transform", `rotate(${expression.tilt} 63 67) translate(0 ${expression.uneven})`)
    rightEye.setAttribute("transform", `rotate(${-expression.tilt} 134 67) translate(0 ${-expression.uneven})`)
    // Keep attention on the diagram even while an action is resting.
    const wire = { x: (poses[0].x + poses[1].x) / 2, y: (poses[0].y + poses[1].y) / 2 }
    const targetPose = (index: number) => index === -1 ? wire : poses[index]
    const building = phase === 0 && !reaction.active
    const buildStep = Math.max(0, Math.min(3, Math.floor((time - 550) / 450)))
    const from = targetPose(reaction.active ? reaction.gazeFrom : building ? buildGazeOrder[buildStep] : motion.gazeFrom)
    const to = targetPose(reaction.active ? reaction.gazeTo : building ? buildGazeOrder[buildStep + 1] : motion.gazeTo)
    const progress = reaction.active ? reaction.gazeProgress : building ? storyProgress(time, 550 + buildStep * 450, 550 + buildStep * 450 + (buildStep === 3 ? 200 : 450)) : motion.gazeProgress
    const target = phase === 2 || reaction.active || building ? { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress } : poses[0]
    const resetGaze = storyProgress(time, 8300, LOOP_MS)
    target.x += (nextBuildRoot.x - target.x) * resetGaze
    target.y += (nextBuildRoot.y - target.y) * resetGaze
    const localTarget = archieLocalPoint(poses[4], target)
    const dx = localTarget.x - 98.5
    const dy = localTarget.y - 67
    const distance = Math.max(1, Math.hypot(dx, dy))
    const eyeX = dx / distance * 5.5
    const eyeY = dy / distance * 5.5
    eyes.setAttribute("transform", `translate(${eyeX} ${eyeY})`)

    // Words move through a clipped slot, never crossfade on top of each other.
    const slide = reducedMotion || elapsed < 550 ? 1 : storyProgress(local, 0, 550)
    words.forEach((word, i) => {
      const outgoing = elapsed >= 550 && i === (phase + phases.length - 1) % phases.length && local < 550
      word.style.opacity = i === phase || outgoing ? "1" : "0"
      word.style.transform = `translateY(${i === phase ? (1 - slide) * 115 : outgoing ? -slide * 115 : 115}%)`
    })
    const aha = time > 7650 && time < 8100 ? Math.sin((time - 7650) / 450 * Math.PI) : 0
    sparkle.style.opacity = String(aha)
    root.style.setProperty("--ah-component-icon", "1")
  }
}
