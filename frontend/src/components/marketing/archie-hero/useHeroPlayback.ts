import { createCharacterPainter } from "./heroCharacter"
import { mediaStoryTime, storyMediaTime } from "./heroModel"
import { createDiagramPainter } from "./heroDiagram"
import { useEffect, useRef, type RefObject } from "react"

export function useHeroPlayback(
  ref: RefObject<HTMLElement | null>,
) {
  const elapsed = useRef(0)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const video = root.querySelector<HTMLVideoElement>(".ah-archie-video")
    const paintCharacter = createCharacterPainter(root)
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const paintDiagram = createDiagramPainter(root)
    let inView = true
    let focused = document.hasFocus()
    let frame = 0
    let previous = 0
    let videoFrame = 0
    let videoFailed = false
    let active = true
    const hasVideo = () => Boolean(video && !videoFailed && video.readyState >= 2 && Number.isFinite(video.duration))
    const videoTime = (seconds: number) => mediaStoryTime(seconds, video!.duration)
    let presentedMediaTime = video?.currentTime ?? 0
    const syncVideoTime = (seconds: number) => {
      presentedMediaTime = seconds
      elapsed.current = videoTime(seconds)
    }
    const paint = () => {
      const videoReady = hasVideo()
      const seconds = videoReady ? presentedMediaTime : elapsed.current / 1000
      paintCharacter(seconds)
      paintDiagram({ seconds, elapsed: elapsed.current, videoReady, reducedMotion: query.matches })
    }
    const stopFrames = () => {
      cancelAnimationFrame(frame)
      if (videoFrame) video?.cancelVideoFrameCallback(videoFrame)
      videoFrame = 0
      previous = 0
    }
    const tick = (now: number) => {
      const videoReady = hasVideo()
      if (videoReady) {
        // Smooth the live diagram from the media clock between recorded frames.
        // Character masks and ink must stay on the last presented video frame.
        elapsed.current = videoTime(video!.currentTime)
        if (!("requestVideoFrameCallback" in video!)) {
          presentedMediaTime = video!.currentTime
          paintCharacter(presentedMediaTime)
        }
      }
      else if (previous) elapsed.current += now - previous
      previous = now
      paintDiagram({
        seconds: videoReady ? presentedMediaTime : elapsed.current / 1000,
        elapsed: elapsed.current,
        videoReady,
        reducedMotion: query.matches,
      })
      frame = requestAnimationFrame(tick)
    }
    const onVideoFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      presentedMediaTime = metadata.mediaTime
      paintCharacter(presentedMediaTime)
      videoFrame = video!.requestVideoFrameCallback(onVideoFrame)
    }
    const update = () => {
      stopFrames()
      const playing =
        !document.hidden && focused && inView && !query.matches
      root.dataset.playing = String(playing)
      root.dataset.reduced = String(query.matches)
      root.dataset.videoReady = String(hasVideo())
      root.dataset.videoFailed = String(videoFailed)
      if (hasVideo()) {
        video!.playbackRate = 1
        if (query.matches) {
          video!.pause()
          const still = storyMediaTime(7000, video!.duration)
          if (Math.abs(video!.currentTime - still) > .01) video!.currentTime = still
        }
        // Focus changes must not advance the character to an unpresented frame.
        elapsed.current = videoTime(video!.currentTime)
      }
      paint()
      if (video && !videoFailed) {
        if (playing) {
          void video.play().catch((error: DOMException) => {
            if (!active || error.name === "AbortError") return
            // Restore the original illustration when playback is unavailable.
            videoFailed = true
            update()
          })
        } else video.pause()
      }
      if (playing) {
        if (hasVideo() && "requestVideoFrameCallback" in video!) {
          videoFrame = video!.requestVideoFrameCallback(onVideoFrame)
        }
        frame = requestAnimationFrame(tick)
      }
    }
    const onSeeked = () => {
      if (hasVideo()) syncVideoTime(video!.currentTime)
      paint()
    }
    const onVideoError = () => {
      videoFailed = true
      update()
    }
    const focus = () => {
      focused = true
      update()
    }
    const blur = () => {
      focused = false
      update()
    }
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      update()
    })
    video?.addEventListener("loadeddata", update)
    video?.addEventListener("seeked", onSeeked)
    video?.addEventListener("error", onVideoError)
    observer.observe(root)
    document.addEventListener("visibilitychange", update)
    window.addEventListener("focus", focus)
    window.addEventListener("blur", blur)
    query.addEventListener("change", update)
    update()
    return () => {
      active = false
      stopFrames()
      video?.pause()
      video?.removeEventListener("loadeddata", update)
      video?.removeEventListener("seeked", onSeeked)
      video?.removeEventListener("error", onVideoError)
      observer.disconnect()
      document.removeEventListener("visibilitychange", update)
      window.removeEventListener("focus", focus)
      window.removeEventListener("blur", blur)
      query.removeEventListener("change", update)
    }
  }, [ref])
}
