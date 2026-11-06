import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"
import { HERO_INK_FPS } from "../src/components/marketing/archie-hero/heroModel.ts"
import hashes from "./fixtures/hero-character-hashes.json" with { type: "json" }
import eyeHashes from "./fixtures/hero-eye-hashes.json" with { type: "json" }
import { CHARACTER_FRAME_COUNT, characterFrameIndex, createCharacterPainter, drawCharacterFrame, sampleCharacterFrame } from "../src/components/marketing/archie-hero/heroCharacter.ts"

test("existing character geometry stays identical across all 110 frames", () => {
  assert.equal(CHARACTER_FRAME_COUNT, hashes.length)
  hashes.forEach((expected, index) => {
    const { pupilOutline, eyeWhites, ...frame } = sampleCharacterFrame(index / HERO_INK_FPS)
    assert.equal((pupilOutline.match(/M/g) ?? []).length, 2, `Expected two pupils at frame ${index}`)
    assert.equal((eyeWhites.match(/M/g) ?? []).length, 2)
    // Keep the approved fixture serialization; its duplicate field is no longer
    // part of the runtime frame. Do not rebase a visual baseline for a refactor.
    const { mask, bodyOutline, glassesFill, handPath, handFill } = frame
    const approvedShape = { mask, glassesOutline: glassesFill, bodyOutline, glassesFill, handPath, handFill }
    const actual = createHash("sha256").update(JSON.stringify(approvedShape)).digest("hex")
    assert.equal(actual, expected, `Character geometry changed at frame ${index}`)
  })
})

test("character sampling holds a source frame and clamps at recording boundaries", () => {
  assert.equal(characterFrameIndex(0), 0)
  assert.equal(characterFrameIndex(.082), 0)
  assert.equal(characterFrameIndex(1 / HERO_INK_FPS), 1)
  assert.equal(characterFrameIndex(110 / HERO_INK_FPS), 109)
  assert.equal(characterFrameIndex(-1), 0)
  assert.equal(characterFrameIndex(Number.NaN), 0)
})

test("pupil and lens geometry stays identical across all 110 frames", () => {
  assert.equal(eyeHashes.length, CHARACTER_FRAME_COUNT)
  eyeHashes.forEach((expected, index) => {
    const { pupilOutline, eyeWhites } = sampleCharacterFrame(index / HERO_INK_FPS)
    const actual = createHash("sha256").update(JSON.stringify([pupilOutline, eyeWhites])).digest("hex")
    assert.equal(actual, expected, `Eye geometry changed at frame ${index}`)
  })
})

function fakeCanvas() {
  const operations: {operation: string; fill: string; path?: string; width?: number}[] = []
  const context = {
    fillStyle: "", strokeStyle: "", lineWidth: 0, globalCompositeOperation: "source-over",
    clearRect() { operations.push({operation: "clear", fill: this.fillStyle}) },
    save() {}, restore() {}, clip() {},
    drawImage() { operations.push({operation: "source", fill: this.fillStyle}) },
    fill(path: {d: string}) { operations.push({operation: this.globalCompositeOperation, fill: this.fillStyle, path: path.d}) },
    stroke(path: {d: string}) { operations.push({operation: "stroke", fill: this.strokeStyle, path: path.d, width: this.lineWidth}) },
  }
  // The real canvas restores state at each save/restore boundary.
  const states: {fillStyle: string; strokeStyle: string; lineWidth: number; globalCompositeOperation: string}[] = []
  context.save = () => { states.push({fillStyle: context.fillStyle, strokeStyle: context.strokeStyle, lineWidth: context.lineWidth, globalCompositeOperation: context.globalCompositeOperation}) }
  context.restore = () => { Object.assign(context, states.pop()) }
  return {context: context as unknown as CanvasRenderingContext2D, operations}
}

test("every recorded pose paints opaque body, eye whites, and black pupils on one surface", () => {
  const original = globalThis.Path2D
  globalThis.Path2D = class {d: string; constructor(d: string) {this.d = d}} as unknown as typeof Path2D
  try {
    for (let index = 0; index < CHARACTER_FRAME_COUNT; index++) {
      const {context, operations} = fakeCanvas()
      const frame = sampleCharacterFrame(index / HERO_INK_FPS)
      drawCharacterFrame(context, {} as CanvasImageSource, frame)
      assert.equal(operations[0].operation, "clear")
      assert.equal(operations[1].operation, "source")
      assert.ok(operations.some(op => op.path === frame.bodyOutline && op.fill === "#008fff" && op.operation === "source-over"))
      assert.deepEqual(operations.filter(op => op.operation === "source-over").slice(-3).map(op => [op.fill, op.path]), [["#000",frame.glassesFill],["#fff",frame.eyeWhites],["#000",frame.pupilOutline]])
      assert.ok(!operations.some(op => op.operation === "stroke" && (op.path === frame.glassesFill || op.path === frame.eyeWhites)), `Extra rim outline at frame ${index}`)
    }
  } finally {
    if (original) globalThis.Path2D = original
    else Reflect.deleteProperty(globalThis, "Path2D")
  }
})

test("character painter waits for decoded pixels and holds each native frame through seek and loop", () => {
  const original = globalThis.Path2D
  globalThis.Path2D = class {} as typeof Path2D
  try {
    const {context, operations} = fakeCanvas()
    const video = {readyState: 0}
    const root = {querySelector: (s: string) => s === ".ah-archie-video" ? video : {getContext: () => context}} as unknown as HTMLElement
    const paint = createCharacterPainter(root)
    paint(0)
    assert.equal(operations.length, 0)
    video.readyState = 2
    paint(0)
    const count = operations.length
    assert.ok(count > 0)
    paint(.01)
    assert.equal(operations.length, count)
    paint(109 / HERO_INK_FPS)
    paint(0)
    assert.equal(operations.length, count * 3)
  } finally {
    if (original) globalThis.Path2D = original
    else Reflect.deleteProperty(globalThis, "Path2D")
  }
})

test("frame 88 retains deep navy magnifier ink while its lens stays transparent", () => {
  const contours = [...sampleCharacterFrame(87 / HERO_INK_FPS).mask.matchAll(/M([^Z]+)Z/g)]
    .map(match => match[1].split("L").map(point => point.split(",").map(Number)))
  const contains = (x: number, y: number) => {
    let inside = false
    for (const points of contours) for (let i = 0; i < points.length; i++) {
      const [ax, ay] = points[i], [bx, by] = points[(i + points.length - 1) % points.length]
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
    }
    return inside
  }
  for (const [x, y] of [[469,198], [512,240], [469,283], [425,240]]) assert.equal(contains(x,y), true)
  assert.equal(contains(469,240), false)
})
