import { createHash } from "node:crypto"
import { mediaStoryTime } from "../../src/components/marketing/archie-hero/heroModel.ts"

type Frame = { seconds: number; elapsed: number; videoReady: boolean; reducedMotion: boolean }
type Painter = (root: HTMLElement) => (frame: Frame) => void

// Small DOM recorder for the painter's attributes, styles, text and dataset.
// Persistent nodes also exercise its cached phase/system/ink updates.
export function recordingRoot() {
  const nodes = new Map<string, Record<string, unknown>>()
  function element(id: string): unknown {
    if (nodes.has(id)) return nodes.get(id)
    const style: Record<string, unknown> = {}
    style.setProperty = (name: string, value: string) => { style[name] = value }
    const node = {
      style,
      dataset: {} as Record<string, string>,
      attributes: {} as Record<string, string>,
      textContent: "",
      setAttribute(name: string, value: string) { this.attributes[name] = value },
      querySelector(selector: string) { return element(`${id}/${selector}`) },
      querySelectorAll(selector: string) {
        const keys = selector === "[data-node-icon]"
          ? ["component", "processor", "database", "analytics", "search", "cache", "queue", "worker", "api", "storage", "router", "client"]
          : Array.from({ length: selector === "[data-placement-guide]" ? 4 : 3 }, (_, i) => String(i))
        return keys.map(key => {
          const child = element(`${id}/${selector}/${key}`) as typeof node
          if (selector === "[data-node-icon]") child.dataset.nodeIcon = key
          return child
        })
      },
    }
    nodes.set(id, node)
    return node
  }
  return {
    root: element("root") as HTMLElement,
    snapshot: () => JSON.stringify([...nodes]),
  }
}

export function diagramSnapshots(createPainter: Painter) {
  const sequences: Record<string, Frame[]> = {
    recording: Array.from({ length: 110 }, (_, i) => ({ seconds: i / 12, elapsed: mediaStoryTime(i / 12, 110 / 12), videoReady: true, reducedMotion: false })),
    fallback: Array.from({ length: 216 }, (_, i) => ({ seconds: i / 8, elapsed: i * 125, videoReady: false, reducedMotion: false })),
    transitions: [7, 7, 0, 4, 8, 2, 0].map((seconds, index) => ({ seconds, elapsed: seconds * 1000, videoReady: index % 2 === 0, reducedMotion: index < 4 })),
  }
  return Object.fromEntries(Object.entries(sequences).map(([name, frames]) => {
    const recorder = recordingRoot()
    const paint = createPainter(recorder.root)
    const digest = createHash("sha256")
    frames.forEach(frame => { paint(frame); digest.update(recorder.snapshot()) })
    return [name, digest.digest("hex")]
  }))
}
