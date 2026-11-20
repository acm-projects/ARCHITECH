import type { ComponentType, CSSProperties, ReactNode } from "react";

import type { ArchitechStepId } from "./architechPreviews";
import { Box, Label, Mark, Meter, Route, Scene, ServerRow, type SceneProps } from "./previewScene";

// Text on a filled (active) shape.
function OnActive({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return <text x={x} y={y} textAnchor="middle" className="ax-preview-text is-chosen">{children}</text>;
}

// A labelled component on a small canvas.
function Part({ x, y, width = 34, label, active = false, hidden = false }: {
  x: number;
  y: number;
  width?: number;
  label: string;
  active?: boolean;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return <g>
    <Box x={x} y={y} width={width} height={13} active={active} />
    {active ? <OnActive x={x + width / 2} y={y + 9}>{label}</OnActive> : <Label x={x + width / 2} y={y + 9} anchor="middle" strong>{label}</Label>}
  </g>;
}

// Two components and their link: the smallest design, drawn inside a screen or a file.
function MiniDesign({ x, y, hidden = false }: { x: number; y: number; hidden?: boolean }) {
  return <g className="ax-preview-fade" style={{ opacity: hidden ? 0 : 1 }}>
    <rect x={x} y={y} width={12} height={7} rx={1} className="ax-preview-solid" />
    <line x1={x + 12} y1={y + 3.5} x2={x + 20} y2={y + 11.5} className="ax-preview-route" />
    <rect x={x + 20} y={y + 8} width={12} height={7} rx={1} className="ax-preview-solid" />
  </g>;
}

function Database({ x, y, active = false }: { x: number; y: number; active?: boolean }) {
  const shape = active ? "ax-preview-chosen" : "ax-preview-stop";
  return <g>
    <path d={`M${x} ${y} v18 a11 4 0 0 0 22 0 v-18`} className={shape} />
    <ellipse cx={x + 11} cy={y} rx={11} ry={4} className={shape} />
  </g>;
}

function DesignerScene({ frame }: SceneProps) {
  const cost = [0.25, 0.25, 0.55, 0.55][frame]!;
  const latency = [0.7, 0.7, 0.4, 0.4][frame]!;
  return (
    <Scene>
      <Box x={1} y={2} width={96} height={54} />
      <Part x={8} y={10} label="Server" active={frame === 0} />
      {frame >= 1 && <>
        <path d="M42 16.5 H50 V36.5 H56" className={frame === 1 ? "ax-preview-route is-chosen" : "ax-preview-route"} fill="none" />
        <Part x={56} y={30} width={34} label="DB" active={frame === 1} />
      </>}
      <Label x={104} y={12} strong={frame === 2}>Cost</Label>
      <Meter x={104} y={15} width={50} height={4} value={cost} />
      <Label x={104} y={31} strong={frame === 2}>Latency</Label>
      <Meter x={104} y={34} width={50} height={4} value={latency} />
      <Label x={104} y={52} strong={frame === 3}>{frame === 3 ? "Saved ✓" : "Editing"}</Label>
    </Scene>
  );
}

const HUB = { x: 72, y: 29 } as const;
const HUB_POINTING = ["0deg", "180deg", "38deg", "-38deg"] as const;

function EdgeScene({ frame }: SceneProps) {
  const loaded = frame >= 1;
  return (
    <Scene>
      <Box x={1} y={16} width={34} height={26} active={frame === 1} />
      {[22, 28, 34].map((y, index) => <rect key={y} x={6} y={y} width={index === 2 ? 14 : 24} height={2} rx={1} className={frame === 1 ? "ax-preview-on-active" : loaded ? "ax-preview-solid" : "ax-preview-track"} />)}
      <Route from={[35, 29]} to={[HUB.x, HUB.y]} active={frame < 2} />
      <Route from={[HUB.x, HUB.y]} to={[106, 12]} active={frame === 3} />
      <Route from={[HUB.x, HUB.y]} to={[104, 45]} active={frame === 2} />
      <circle cx={HUB.x} cy={HUB.y} r={12} className="ax-preview-chosen" />
      <path d="M-6 0 H5 M1 -4 L6 0 L1 4" className="ax-preview-signpost" style={{ transform: `translate(${HUB.x}px, ${HUB.y}px) rotate(${HUB_POINTING[frame]})` }} />
      <Part x={106} y={4} width={48} label="Archie" active={frame === 3} />
      <ServerRow x={104} y={38} width={50} active={frame === 2} />
    </Scene>
  );
}

function ApiScene({ frame }: SceneProps) {
  return (
    <Scene>
      <Box x={1} y={9} width={36} height={40} />
      <MiniDesign x={3} y={20} />
      <Route from={[37, 29]} to={[43, 29]} active={frame >= 1} />
      <circle cx={50} cy={29} r={7} className={frame === 1 ? "ax-preview-chosen" : "ax-preview-stop"} />
      {frame >= 1 && (frame === 1 ? <OnActive x={50} y={32}>{"✓"}</OnActive> : <Mark x={50} y={32} kind="yes" />)}
      <Label x={50} y={46} anchor="middle" strong={frame === 1}>Yours</Label>
      <Route from={[57, 29]} to={[100, 29]} active={frame >= 2} />
      {frame >= 3 && <>
        <Box x={110} y={6} width={40} height={28} />
        <Label x={146} y={14} anchor="end">older</Label>
      </>}
      <Box x={102} y={16} width={40} height={30} active={frame >= 2} />
      {frame >= 2 ? <OnActive x={122} y={33}>Saved</OnActive> : <Label x={122} y={33} anchor="middle">Project</Label>}
    </Scene>
  );
}

const PROVIDERS = ["GitHub", "Google", "Email"] as const;
const PROVIDER_ROWS = [2, 21, 40] as const;

function AuthScene({ frame }: SceneProps) {
  const chosen = (index: number) => frame === 0 ? index === 0 : frame === 1 ? index > 0 : index === 2;
  return (
    <Scene>
      {PROVIDERS.map((provider, index) => (
        <Part key={provider} x={1} y={PROVIDER_ROWS[index]!} width={60} label={provider} active={chosen(index)} />
      ))}
      <Route from={[61, 46.5]} to={[84, 15]} active={frame >= 2} />
      <Box x={84} y={8} width={70} height={14} />
      {frame >= 2 && [0, 1, 2, 3, 4].map(dot => <circle key={dot} cx={92 + dot * 7} cy={15} r={1.8} className="ax-preview-solid" />)}
      {frame >= 2 && [0, 1, 2, 3, 4].map(attempt => <Mark key={attempt} x={92 + attempt * 13} y={34} kind="no" />)}
      {frame === 3 && <>
        <rect x={98} y={42} width={42} height={13} rx={2} className="ax-preview-chosen" />
        <OnActive x={119} y={51}>Wait 15 min</OnActive>
      </>}
    </Scene>
  );
}

function DatabaseScene({ frame }: SceneProps) {
  return (
    <Scene>
      <g className={frame >= 1 ? "ax-preview-ruled-out" : undefined}>
        <Box x={1} y={8} width={46} height={30} />
        <rect x={-2} y={38} width={52} height={3} rx={1} className="ax-preview-solid" />
        <MiniDesign x={8} y={15} hidden={frame >= 1} />
      </g>
      <Route from={[47, 24]} to={[67, 24]} active={frame === 0} />
      <Database x={67} y={16} active={frame === 0 || frame === 3} />
      <Route from={[89, 24]} to={[106, 24]} active={frame >= 2} />
      <Box x={106} y={5} width={48} height={34} />
      <rect x={126} y={39} width={8} height={7} className="ax-preview-solid" />
      <MiniDesign x={114} y={13} hidden={frame < 3} />
      <Label x={24} y={54} anchor="middle" strong={frame < 2}>Laptop</Label>
      <Label x={130} y={54} anchor="middle" strong={frame >= 2}>Desktop</Label>
    </Scene>
  );
}

const ANSWER_LINES = [{ y: 19, width: 92 }, { y: 26, width: 78 }, { y: 33, width: 60 }] as const;

function ArchieScene({ frame, playing }: SceneProps) {
  return (
    <Scene>
      <Part x={86} y={1} width={68} label="Review this" active={frame === 0} />
      {frame >= 2 && ANSWER_LINES.map(line => (
        <rect key={line.y} x={1} y={line.y} width={line.width} height={3} rx={1} className={frame === 3 ? "ax-preview-chosen" : "ax-preview-solid"} />
      ))}
      {frame === 2 && playing && [0, 1, 2].map(index => (
        <circle key={index} cx={66 + index * 6} cy={34.5} r={1.6} className="ax-preview-wait" style={{ "--ax-preview-delay": `${index * 180}ms` } as CSSProperties} />
      ))}
      <Label x={1} y={52} strong={frame === 1}>Left today</Label>
      <Meter x={36} y={48} width={44} height={4} value={frame >= 1 ? 0.62 : 0.7} />
      {frame === 3 && <Label x={154} y={52} anchor="end" strong>From cache</Label>}
    </Scene>
  );
}

function ModelScene({ frame, playing }: SceneProps) {
  const busy = frame >= 2;
  return (
    <Scene>
      <g className={busy ? "ax-preview-ruled-out" : undefined}>
        <Part x={1} y={20} width={38} label="Model" active={frame === 1} />
      </g>
      {busy && <Mark x={20} y={44} kind="no" />}
      <Route from={[39, 26.5]} to={[116, 26.5]} active={frame < 2} />
      {frame === 1 && playing && [0, 1, 2].map(index => (
        <rect key={index} x={40} y={23.5} width={7} height={6} rx={1} className="ax-preview-segment" style={{ "--ax-preview-delay": `${index * 160}ms` } as CSSProperties} />
      ))}
      <Part x={116} y={20} width={38} label="Archie" active={frame === 0 || frame === 3} />
      {frame === 3 && <Label x={135} y={46} anchor="middle" strong>Retry soon</Label>}
    </Scene>
  );
}

const SERVICE_ROWS = [8, 23, 38] as const;

function ExportScene({ frame }: SceneProps) {
  return (
    <Scene>
      <Box x={1} y={10} width={38} height={36} active={frame === 0} />
      <MiniDesign x={4} y={20} />
      <Route from={[39, 28]} to={[52, 28]} active={frame >= 1} />
      {frame >= 1 && SERVICE_ROWS.map(y => <Box key={y} x={52} y={y} width={34} height={11} active={frame === 1} />)}
      <Route from={[86, 28]} to={[100, 28]} active={frame >= 2} />
      <path d="M100 12 H115 L122 19 V44 H100 Z" className={frame === 2 ? "ax-preview-chosen" : "ax-preview-outline"} />
      <Label x={111} y={53} anchor="middle" strong={frame === 2}>compose</Label>
      <Route from={[122, 28]} to={[134, 28]} active={frame === 3} />
      <circle cx={144} cy={28} r={10} className={frame === 3 ? "ax-preview-chosen" : "ax-preview-stop"} />
      <path d="M0 0 L8 5 L0 10 Z" transform="translate(141 23)" className={frame === 3 ? "ax-preview-on-active" : "ax-preview-solid"} />
    </Scene>
  );
}

const CHECKS = [{ label: "Tests", x: 42, passAt: 1 }, { label: "Types", x: 70, passAt: 2 }, { label: "Build", x: 98, passAt: 2 }] as const;

function CiScene({ frame }: SceneProps) {
  return (
    <Scene>
      <Route from={[10, 26]} to={[120, 26]} />
      <circle cx={10} cy={26} r={6} className={frame === 0 ? "ax-preview-chosen" : "ax-preview-solid"} />
      <Label x={10} y={46} anchor="middle" strong={frame === 0}>Push</Label>
      {CHECKS.map(check => (
        <g key={check.label}>
          <circle cx={check.x} cy={26} r={7} className={frame === check.passAt ? "ax-preview-chosen" : "ax-preview-stop"} />
          {frame >= check.passAt && (frame === check.passAt ? <OnActive x={check.x} y={29}>{"✓"}</OnActive> : <Mark x={check.x} y={29} kind="yes" />)}
          <Label x={check.x} y={46} anchor="middle" strong={frame === check.passAt}>{check.label}</Label>
        </g>
      ))}
      <Box x={120} y={10} width={34} height={32} active={frame === 3} />
      {frame === 3 ? <OnActive x={137} y={29}>Live</OnActive> : <Label x={137} y={29} anchor="middle">Site</Label>}
    </Scene>
  );
}

const COMMITS = [{ x: 22, at: 0 }, { x: 50, at: 1 }, { x: 78, at: 2 }] as const;

function GitScene({ frame }: SceneProps) {
  return (
    <Scene>
      <Label x={1} y={12} strong>main</Label>
      <Route from={[8, 28]} to={[92, 28]} />
      {COMMITS.map(commit => (
        <circle key={commit.x} cx={commit.x} cy={28} r={6}
          className={commit.at === 0 || frame > commit.at ? "ax-preview-solid" : frame === commit.at ? "ax-preview-chosen" : "ax-preview-stop"} />
      ))}
      {frame === 0 && <Label x={50} y={46} anchor="middle" strong>editing…</Label>}
      <Route from={[92, 28]} to={[112, 28]} active={frame === 3} />
      <Box x={112} y={14} width={42} height={28} active={frame === 3} />
      {frame === 3 ? <OnActive x={133} y={31}>GitHub</OnActive> : <Label x={133} y={31} anchor="middle">GitHub</Label>}
    </Scene>
  );
}

const JOURNEY = [
  { label: "Ship", x: 16 },
  { label: "Design", x: 58 },
  { label: "Save", x: 100 },
  { label: "Review", x: 138 },
] as const;

function ReviewScene({ frame }: SceneProps) {
  return (
    <Scene>
      <Route from={[JOURNEY[0].x, 22]} to={[JOURNEY[3].x, 22]} />
      {JOURNEY.map((stop, index) => (
        <g key={stop.label}>
          <circle cx={stop.x} cy={22} r={9} className={index === frame ? "ax-preview-chosen" : index < frame ? "ax-preview-solid" : "ax-preview-stop"} />
          <Label x={stop.x} y={47} anchor="middle" strong={index === frame}>{stop.label}</Label>
        </g>
      ))}
    </Scene>
  );
}

export const ARCHITECH_SCENES: Record<ArchitechStepId, ComponentType<SceneProps>> = {
  designer: DesignerScene,
  edge: EdgeScene,
  api: ApiScene,
  auth: AuthScene,
  db: DatabaseScene,
  archie: ArchieScene,
  model: ModelScene,
  export: ExportScene,
  ci: CiScene,
  git: GitScene,
  review: ReviewScene,
};
