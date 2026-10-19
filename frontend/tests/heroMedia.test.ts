import assert from "node:assert/strict"
import test from "node:test"
import { LOOP_MS, mediaStoryTime, storyMediaTime } from "../src/components/marketing/archie-hero/heroModel.ts"

const duration = 110 / 12

test("recorded placement, pull, recovery, and inspection drive the diagram", () => {
  assert.equal(mediaStoryTime(1.25, duration), 800)
  assert.equal(mediaStoryTime(3.5, duration), 3050)
  assert.equal(mediaStoryTime(4, duration), 3500)
  assert.equal(mediaStoryTime(6.75, duration), 6200)
  let previous = -1
  for (let frame = 0; frame <= 110; frame++) {
    const time = mediaStoryTime(frame / 12, duration)
    assert.ok(time >= previous && time < LOOP_MS)
    previous = time
  }
})

test("paused and reduced-motion stills use the same clock in both directions", () => {
  for (let time = 0; time < LOOP_MS; time += 25) {
    assert.ok(Math.abs(mediaStoryTime(storyMediaTime(time, duration), duration) - time) < .001)
  }
  assert.equal(mediaStoryTime(0, 0), 0)
  assert.equal(mediaStoryTime(Number.NaN, duration), 0)
  assert.equal(mediaStoryTime(-1, duration), 0)
  assert.ok(mediaStoryTime(duration + 1, duration) < LOOP_MS)
})
