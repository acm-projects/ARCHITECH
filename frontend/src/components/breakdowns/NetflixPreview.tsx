"use client";

import LivePreviewCard from "./LivePreviewCard";
import { NETFLIX_SCENES } from "./NetflixPreviewScenes";
import { NETFLIX_PREVIEWS, type NetflixStepId } from "./netflixPreviews";

export default function NetflixPreview({ step, onFrame }: {
  step: NetflixStepId;
  onFrame: (connections: readonly string[]) => void;
}) {
  const SceneForStep = NETFLIX_SCENES[step];
  return (
    <LivePreviewCard frames={NETFLIX_PREVIEWS[step]} onFrame={onFrame}>
      {(frame, playing) => <SceneForStep frame={frame} playing={playing} />}
    </LivePreviewCard>
  );
}
