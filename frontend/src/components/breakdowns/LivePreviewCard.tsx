"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import type { PreviewFrame } from "./livePreview";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const NO_CONNECTIONS: readonly string[] = [];

function subscribeToMotionSetting(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Plays once and holds the last frame, which is also all that reduced motion shows.
export default function LivePreviewCard({ frames, onFrame, children }: {
  frames: readonly PreviewFrame[];
  onFrame: (connections: readonly string[]) => void;
  children: (frame: number, playing: boolean) => ReactNode;
}) {
  const reducedMotion = useSyncExternalStore(
    subscribeToMotionSetting,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
  const lastFrame = frames.length - 1;
  const [playhead, setPlayhead] = useState(0);
  const frame = reducedMotion ? lastFrame : playhead;
  const playing = frame < lastFrame;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => setPlayhead(frame + 1), frames[frame]!.ms);
    return () => clearTimeout(timer);
  }, [frames, frame, playing]);

  useEffect(() => onFrame(frames[frame]!.connections), [frames, frame, onFrame]);
  useEffect(() => () => onFrame(NO_CONNECTIONS), [onFrame]);

  return (
    <figure className="ax-live-preview" aria-labelledby="live-preview-title">
      <div className="ax-live-preview-header">
        <p className="ax-live-preview-title" id="live-preview-title">Live preview</p>
        {!reducedMotion && (
          <button type="button" className="ax-live-preview-replay" aria-label="Replay live preview" title="Replay" onClick={() => setPlayhead(0)}>
            <RotateCcw size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="ax-live-preview-scene" aria-hidden="true">{children(frame, playing)}</div>
      <figcaption>{frames[frame]!.caption}</figcaption>
    </figure>
  );
}
