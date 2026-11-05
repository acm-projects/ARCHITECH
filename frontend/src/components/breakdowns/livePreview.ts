// One moment of a preview: what the pill says, how long it holds, and which diagram
// connections it is using. Scenes draw the moment; this stays free of any one breakdown.
export type PreviewFrame = {
  caption: string;
  ms: number;
  connections: readonly string[];
};

// Moving content that runs beside other text needs a pause control past five seconds
// (WCAG 2.2.2), so a preview plays once inside that limit and holds its last frame.
export const MAX_PREVIEW_MS = 5_000;

export const previewDurationMs = (frames: readonly PreviewFrame[]) =>
  frames.reduce((total, frame) => total + frame.ms, 0);
