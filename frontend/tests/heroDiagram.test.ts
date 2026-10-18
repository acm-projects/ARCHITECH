import assert from "node:assert/strict"
import test from "node:test"
import expected from "./fixtures/hero-diagram-hashes.json" with { type: "json" }
import { createDiagramPainter } from "../src/components/marketing/archie-hero/heroDiagram.ts"
import { diagramSnapshots, recordingRoot } from "./support/heroDiagramSnapshot.ts"

test("extracted renderer preserves recorded, fallback and reduced-motion diagram output", () => {
  assert.deepEqual(diagramSnapshots(createDiagramPainter), expected)
})

test("reduced motion shows a fully connected, ready system without animated effects", () => {
  const recorder = recordingRoot()
  createDiagramPainter(recorder.root)({seconds: 7, elapsed: 7000, videoReady: true, reducedMotion: true})
  const nodes = new Map<string, {attributes: Record<string, string>; style: Record<string, string>; dataset: Record<string, string>}>(JSON.parse(recorder.snapshot()))
  for (let branch = 0; branch < 3; branch++) {
    const wire = nodes.get(`root/[data-wire]/${branch}`)!
    assert.equal((wire.attributes.d.match(/M/g) ?? []).length, 1)
    assert.equal(wire.style.opacity, "1")
    assert.equal(nodes.get(`root/[data-flow]/${branch}`)!.style.opacity, "0")
  }
  for (const kind of ["component", "processor", "database", "analytics"]) {
    const node = nodes.get(`root/[data-actor="${kind}"]`)!
    assert.equal(node.dataset.status, "ready")
    assert.equal(node.style.opacity, "1")
  }
})
