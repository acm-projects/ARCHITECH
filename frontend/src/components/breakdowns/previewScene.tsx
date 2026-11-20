import type { ReactNode } from "react";

// Drawing pieces for live previews: a small fixed scene in the theme's preview colors.
// Each breakdown composes its own scenes from these.

export type SceneProps = { frame: number; playing: boolean };

export const SCENE_WIDTH = 156;
export const SCENE_HEIGHT = 58;

export function Scene({ children }: { children: ReactNode }) {
  return <svg viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`} width={SCENE_WIDTH} height={SCENE_HEIGHT}>{children}</svg>;
}

export function Box({ x, y, width, height, active = false }: { x: number; y: number; width: number; height: number; active?: boolean }) {
  return <rect x={x} y={y} width={width} height={height} rx={2} className={active ? "ax-preview-chosen" : "ax-preview-outline"} />;
}

export function Label({ x, y, strong = false, anchor = "start", children }: {
  x: number;
  y: number;
  strong?: boolean;
  anchor?: "start" | "middle" | "end";
  children: ReactNode;
}) {
  return <text x={x} y={y} textAnchor={anchor} className={`ax-preview-text${strong ? " is-strong" : ""}`}>{children}</text>;
}

export function Route({ from, to, active = false }: { from: [number, number]; to: [number, number]; active?: boolean }) {
  return <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} className={active ? "ax-preview-route is-chosen" : "ax-preview-route"} />;
}

export function Meter({ x, y, width, height = 7, value }: { x: number; y: number; width: number; height?: number; value: number }) {
  return <>
    <rect x={x} y={y} width={width} height={height} rx={2} className="ax-preview-track" />
    <rect x={x} y={y} width={width} height={height} rx={2} className="ax-preview-buffer" style={{ transform: `scaleX(${value})` }} />
  </>;
}

export function Mark({ x, y, kind }: { x: number; y: number; kind: "yes" | "no" }) {
  return <Label x={x} y={y} anchor="middle" strong>{kind === "yes" ? "✓" : "✕"}</Label>;
}

// A rack server: three status lights, filled when it is the chosen one.
export function ServerRow({ x, y, width, active = false }: { x: number; y: number; width: number; active?: boolean }) {
  return <>
    <Box x={x} y={y} width={width} height={15} active={active} />
    {[0, 1, 2].map(dot => <circle key={dot} cx={x + 8 + dot * 6} cy={y + 7.5} r={1.6} className={active ? "ax-preview-on-active" : "ax-preview-solid"} />)}
  </>;
}
