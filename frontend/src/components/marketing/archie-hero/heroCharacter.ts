import videoMasks from "./assets/heroVideoMasks.json" with { type: "json" }
import glassesInk from "./assets/heroGlassesInk.json" with { type: "json" }
import bodyInk from "./assets/heroBodyInk.json" with { type: "json" }
import lensInteriors from "./assets/heroLensInteriors.json" with { type: "json" }
import handMotion from "./assets/heroHandMotion.json" with { type: "json" }
import pupilInk from "./assets/heroPupilInk.json" with { type: "json" }

import { HERO_INK_FPS, heroVideoLayout } from "./heroModel.ts"

const CHARACTER_INK = {
  bodyFill: "#008fff",
  black: "#000",
  eyeWhite: "#fff",
  bodyEraseWidth: 14,
  bodyWidth: 8,
  pupilWidth: 2,
} as const

// Recorded character frames
export const CHARACTER_FRAME_COUNT = videoMasks.length

export type CharacterFrame = {
  mask: string
  bodyOutline: string
  glassesFill: string
  handPath: string
  handFill: string
  pupilOutline: string
  eyeWhites: string
}

export function characterFrameIndex(seconds: number) {
  if (!Number.isFinite(seconds)) return 0
  return Math.min(CHARACTER_FRAME_COUNT - 1, Math.max(0, Math.floor(seconds * HERO_INK_FPS + .0001)))
}

export function sampleCharacterFrame(seconds: number): CharacterFrame {
  const index = characterFrameIndex(seconds)
  return {
    mask: videoMasks[index],
    bodyOutline: bodyInk[index],
    glassesFill: glassesInk[index],
    handPath: handMotion[index]?.d ?? "",
    handFill: handMotion[index]?.fill ?? "none",
    pupilOutline: pupilInk[index],
    eyeWhites: lensInteriors[index],
  }
}

/** Composite one decoded pose; shared by playback and the frame reviewer. */
export function drawCharacterFrame(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  frame: CharacterFrame,
) {
  const { sourceWidth: width, sourceHeight: height } = heroVideoLayout
  context.clearRect(0, 0, width, height)
  context.save()
  context.clip(new Path2D(frame.mask), "evenodd")
  context.drawImage(source, 0, 0, width, height)
  context.restore()

  const body = new Path2D(frame.bodyOutline)
  // Erase the original border so it cannot show through the thicker tracing.
  context.save()
  context.globalCompositeOperation = "destination-out"
  context.lineWidth = CHARACTER_INK.bodyEraseWidth
  context.fill(body)
  context.stroke(body)
  context.restore()
  context.save()
  context.lineJoin = "round"
  context.lineCap = "round"
  context.fillStyle = CHARACTER_INK.bodyFill
  context.strokeStyle = CHARACTER_INK.black
  context.lineWidth = CHARACTER_INK.bodyWidth
  context.fill(body)
  context.stroke(body)
  if (frame.handPath) {
    const hand = new Path2D(frame.handPath)
    context.fillStyle = frame.handFill
    context.fill(hand)
    context.stroke(hand)
  }
  context.fillStyle = CHARACTER_INK.black
  const glasses = new Path2D(frame.glassesFill)
  context.fill(glasses)
  const eyeWhites = new Path2D(frame.eyeWhites)
  // Rims already include their full thickness; another stroke would double it.
  context.fillStyle = CHARACTER_INK.eyeWhite
  context.fill(eyeWhites)
  context.fillStyle = CHARACTER_INK.black
  const pupils = new Path2D(frame.pupilOutline)
  context.fill(pupils)
  context.lineWidth = CHARACTER_INK.pupilWidth
  context.stroke(pupils)
  context.restore()
}

/** Paint only when the decoded source frame changes. */
export function createCharacterPainter(root: HTMLElement) {
  const video = root.querySelector<HTMLVideoElement>(".ah-archie-video")
  const canvas = root.querySelector<HTMLCanvasElement>(".ah-character-frame")
  const context = canvas?.getContext("2d")
  if (!video || !context) throw new Error("Missing Archie character video or canvas")
  let previous = -1
  return (seconds: number) => {
    if (video.readyState < 2) return
    const index = characterFrameIndex(seconds)
    if (index === previous) return
    drawCharacterFrame(context, video, sampleCharacterFrame(seconds))
    previous = index
  }
}
