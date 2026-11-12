import type { ComponentType, CSSProperties, ReactNode } from "react";

import type { NetflixStepId } from "./netflixPreviews";

export type SceneProps = { frame: number; playing: boolean };

const SCENE_WIDTH = 156;
const SCENE_HEIGHT = 58;

function Scene({ children }: { children: ReactNode }) {
  return <svg viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`} width={SCENE_WIDTH} height={SCENE_HEIGHT}>{children}</svg>;
}

function Box({ x, y, width, height, active = false }: { x: number; y: number; width: number; height: number; active?: boolean }) {
  return <rect x={x} y={y} width={width} height={height} rx={2} className={active ? "ax-preview-chosen" : "ax-preview-outline"} />;
}

function Label({ x, y, strong = false, anchor = "start", children }: {
  x: number;
  y: number;
  strong?: boolean;
  anchor?: "start" | "middle" | "end";
  children: ReactNode;
}) {
  return <text x={x} y={y} textAnchor={anchor} className={`ax-preview-text${strong ? " is-strong" : ""}`}>{children}</text>;
}

function Route({ from, to, active = false }: { from: [number, number]; to: [number, number]; active?: boolean }) {
  return <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} className={active ? "ax-preview-route is-chosen" : "ax-preview-route"} />;
}

function Meter({ x, y, width, height = 7, value }: { x: number; y: number; width: number; height?: number; value: number }) {
  return <>
    <rect x={x} y={y} width={width} height={height} rx={2} className="ax-preview-track" />
    <rect x={x} y={y} width={width} height={height} rx={2} className="ax-preview-buffer" style={{ transform: `scaleX(${value})` }} />
  </>;
}

// The show on screen, a plain drawing so no real title or artwork appears.
function Picture({ x, y, width, height, blurred = false, hidden = false }: {
  x: number;
  y: number;
  width: number;
  height: number;
  blurred?: boolean;
  hidden?: boolean;
}) {
  return (
    <svg x={x} y={y} width={width} height={height} viewBox="0 0 60 36" preserveAspectRatio="xMidYMid slice">
      <g className="ax-preview-picture" style={{ filter: blurred ? "blur(3px)" : "blur(0)", opacity: hidden ? 0 : 1 }}>
        <rect width={60} height={36} className="ax-preview-sky" />
        <circle cx={45} cy={10} r={5} className="ax-preview-poster-art" />
        <path d="M0 36 L18 13 L30 26 L40 17 L60 36 Z" className="ax-preview-hill" />
      </g>
    </svg>
  );
}

function Mark({ x, y, kind }: { x: number; y: number; kind: "yes" | "no" }) {
  return <Label x={x} y={y} anchor="middle" strong>{kind === "yes" ? "✓" : "✕"}</Label>;
}

const PLAY_ICON = "M0 0 L10 6 L0 12 Z";

const SCREENS = [
  { label: "TV", x: 1, y: 3, width: 66, height: 40 },
  { label: "Laptop", x: 76, y: 12, width: 42, height: 31 },
  { label: "Phone", x: 128, y: 3, width: 24, height: 40 },
] as const;

function ViewerScene({ frame }: SceneProps) {
  return (
    <Scene>
      {SCREENS.map((screen, index) => (
        <g key={screen.label}>
          <Picture x={screen.x} y={screen.y} width={screen.width} height={screen.height} hidden={frame < index} />
          <Box x={screen.x} y={screen.y} width={screen.width} height={screen.height} />
          {frame === index && <rect x={screen.x - 1} y={screen.y - 1} width={screen.width + 2} height={screen.height + 2} rx={3} className="ax-preview-selected" />}
          <Label x={screen.x + screen.width / 2} y={54} anchor="middle" strong={frame >= index}>{screen.label}</Label>
        </g>
      ))}
    </Scene>
  );
}

const SIGNPOST = { x: 72, y: 29 } as const;
const POINTING = ["0deg", "-38deg", "0deg", "38deg"] as const;

function GatewayScene({ frame }: SceneProps) {
  const browsing = frame < 2;
  return (
    <Scene>
      <Label x={18} y={12} anchor="middle" strong>{browsing ? "Browse" : "Play"}</Label>
      <Picture x={1} y={16} width={34} height={26} />
      <Box x={1} y={16} width={34} height={26} />
      <Route from={[35, 29]} to={[SIGNPOST.x, SIGNPOST.y]} active={frame === 0 || frame === 2} />
      <Route from={[SIGNPOST.x, SIGNPOST.y]} to={[106, 12]} active={frame === 1} />
      <Route from={[SIGNPOST.x, SIGNPOST.y]} to={[110, 46]} active={frame === 3} />
      <circle cx={SIGNPOST.x} cy={SIGNPOST.y} r={12} className="ax-preview-chosen" />
      <path d="M-6 0 H5 M1 -4 L6 0 L1 4" className="ax-preview-signpost" style={{ transform: `translate(${SIGNPOST.x}px, ${SIGNPOST.y}px) rotate(${POINTING[frame]})` }} />
      {[108, 123, 138].map(x => <rect key={x} x={x} y={2} width={12} height={20} rx={1} className={frame === 1 ? "ax-preview-chosen" : "ax-preview-tile"} />)}
      <circle cx={124} cy={45} r={11} className={frame === 3 ? "ax-preview-chosen" : "ax-preview-tile"} />
      <path d={PLAY_ICON} transform="translate(120 39)" className="ax-preview-on-active" />
    </Scene>
  );
}

const POSTER_ROW = { top: 14, width: 26, height: 42, pitch: 31 } as const;
const POSTER_TONES = ["var(--ax-muted)", "var(--ax-subtle)", "var(--ax-ink-soft)", "var(--ax-line-strong)", "var(--ax-subtle)"] as const;
const RANKED_ROWS: readonly (readonly number[])[] = [[0, 1, 2, 3, 4], [2, 0, 4, 1, 3], [4, 2, 0, 3, 1], [4, 2, 0, 3, 1]];
const FEATURED_TITLE = 2;
const ROW_OWNERS = ["All shows", "You", "Your friend", "Your friend"] as const;

// The same title can carry different artwork per viewer: a figure for you, a scene for a friend.
function PosterArt({ title, alternate }: { title: number; alternate: boolean }) {
  const midX = POSTER_ROW.width / 2;
  if (title !== FEATURED_TITLE) return <circle cx={midX} cy={title % 2 ? 14 : 28} r={title % 2 ? 6 : 8} className="ax-preview-poster-art" />;
  return <>
    <g className="ax-preview-fade" style={{ opacity: alternate ? 0 : 1 }}>
      <circle cx={midX} cy={16} r={6} className="ax-preview-poster-art" />
      <rect x={midX - 8} y={24} width={16} height={18} rx={4} className="ax-preview-poster-art" />
    </g>
    <path d={`M0 ${POSTER_ROW.height - 8} L9 22 L16 30 L${POSTER_ROW.width} 12 V${POSTER_ROW.height} H0 Z`} className="ax-preview-poster-art ax-preview-fade" style={{ opacity: alternate ? 1 : 0 }} />
  </>;
}

function DiscoveryScene({ frame }: SceneProps) {
  const order = RANKED_ROWS[frame]!;
  const highlighted = frame === 0 ? null : frame === 3 ? FEATURED_TITLE : order[0];
  return (
    <Scene>
      <Label x={0} y={9} strong>{ROW_OWNERS[frame]}</Label>
      {[0, 1, 2, 3, 4].map(title => (
        <g key={title} className="ax-preview-move" style={{ transform: `translate(${order.indexOf(title) * POSTER_ROW.pitch + 1}px, ${POSTER_ROW.top}px)` }}>
          <rect width={POSTER_ROW.width} height={POSTER_ROW.height} rx={2} fill={POSTER_TONES[title]} />
          <PosterArt title={title} alternate={frame === 3} />
          {highlighted === title && <rect x={-1} y={-1} width={POSTER_ROW.width + 2} height={POSTER_ROW.height + 2} rx={3} className="ax-preview-selected" />}
        </g>
      ))}
    </Scene>
  );
}

const SAVED_SPOT = 0.45;

function HistoryScene({ frame }: SceneProps) {
  const onTv = frame === 3;
  const markerX = frame === 0 ? 14 : onTv ? 129 : 74;
  return (
    <Scene>
      <Route from={[27, 22]} to={[100, 22]} active={frame === 1 || frame === 2} />
      <Picture x={1} y={3} width={26} height={40} />
      <Box x={1} y={3} width={26} height={40} />
      <Meter x={4} y={37} width={20} height={3} value={SAVED_SPOT} />
      <Picture x={100} y={5} width={54} height={36} hidden={frame < 2} />
      <Box x={100} y={5} width={54} height={36} />
      <Meter x={104} y={35} width={46} height={3} value={onTv ? SAVED_SPOT : 0} />
      <path d="M0 0 H9 V13 L4.5 9 L0 13 Z" className="ax-preview-chosen ax-preview-move" style={{ transform: `translate(${markerX}px, ${onTv ? 12 : 15}px)` }} />
      <Label x={14} y={54} anchor="middle" strong={frame < 2}>Phone</Label>
      <Label x={127} y={54} anchor="middle" strong={frame >= 2}>TV</Label>
    </Scene>
  );
}

const LOADING_CARDS = [
  { label: "Popular show", x: 1, loadedAt: 1, waitingAt: -1 },
  { label: "Rarely watched", x: 83, loadedAt: 3, waitingAt: 2 },
] as const;

function CacheScene({ frame, playing }: SceneProps) {
  return (
    <Scene>
      {LOADING_CARDS.map(card => {
        const loaded = frame >= card.loadedAt;
        return (
          <g key={card.label}>
            <Picture x={card.x} y={3} width={72} height={38} hidden={!loaded} />
            <Box x={card.x} y={3} width={72} height={38} />
            {frame === card.waitingAt && playing && [0, 1, 2].map(index => (
              <circle key={index} cx={card.x + 26 + index * 10} cy={22} r={3} className="ax-preview-wait" style={{ "--ax-preview-delay": `${index * 180}ms` } as CSSProperties} />
            ))}
            <Label x={card.x + 36} y={54} anchor="middle" strong={loaded}>{card.label}</Label>
          </g>
        );
      })}
    </Scene>
  );
}

function PlaybackScene({ frame }: SceneProps) {
  return (
    <Scene>
      <circle cx={21} cy={29} r={19} className="ax-preview-chosen" />
      <path d={PLAY_ICON} transform="translate(16 23)" className="ax-preview-on-active" />
      {[52, 68, 84].map((cx, index) => (
        <g key={cx}>
          <circle cx={cx} cy={29} r={6} className="ax-preview-stop" />
          {frame > index && <Mark x={cx} y={32} kind="yes" />}
        </g>
      ))}
      <Picture x={100} y={8} width={55} height={42} hidden={frame < 3} />
      <Box x={100} y={8} width={55} height={42} />
    </Scene>
  );
}

const SERVER_LEFT = 74;
const SERVER_ROWS = [2, 21, 40] as const;

function ServerRow({ x, y, width, active = false }: { x: number; y: number; width: number; active?: boolean }) {
  return <>
    <Box x={x} y={y} width={width} height={15} active={active} />
    {[0, 1, 2].map(dot => <circle key={dot} cx={x + 8 + dot * 6} cy={y + 7.5} r={1.6} className={active ? "ax-preview-on-active" : "ax-preview-solid"} />)}
  </>;
}

function SteeringScene({ frame }: SceneProps) {
  return (
    <Scene>
      <Picture x={1} y={14} width={44} height={30} hidden={frame < 3} />
      <Box x={1} y={14} width={44} height={30} />
      {SERVER_ROWS.map((y, index) => {
        const chosen = index === 2 && frame === 3;
        const ruledOut = frame > index && !chosen;
        return (
          <g key={y} className={ruledOut ? "ax-preview-ruled-out" : undefined}>
            <Route from={[45, 29]} to={[SERVER_LEFT, y + 7.5]} active={chosen} />
            <ServerRow x={SERVER_LEFT} y={y} width={SCENE_WIDTH - SERVER_LEFT - 1} active={chosen} />
            {ruledOut && <Mark x={SCENE_WIDTH - 11} y={y + 11} kind="no" />}
            {chosen && <text x={SCENE_WIDTH - 11} y={y + 11} textAnchor="middle" className="ax-preview-text is-chosen">{"✓"}</text>}
          </g>
        );
      })}
    </Scene>
  );
}

const WIFI_BARS = [3, 1, 1, 3] as const;

function OpenConnectScene({ frame, playing }: SceneProps) {
  const weak = WIFI_BARS[frame] === 1;
  return (
    <Scene>
      <Box x={1} y={15} width={24} height={28} />
      {[22, 29, 36].map(y => <Route key={y} from={[6, y]} to={[20, y]} />)}
      <Route from={[25, 29]} to={[56, 29]} />
      {playing && [0, 1, 2].filter(index => !weak || index === 0).map(index => (
        <rect key={index} x={25} y={26} width={7} height={6} rx={1} className={weak ? "ax-preview-segment is-slow" : "ax-preview-segment"} style={{ "--ax-preview-delay": `${index * 160}ms` } as CSSProperties} />
      ))}
      <Picture x={56} y={3} width={78} height={52} blurred={frame === 2} />
      <Box x={56} y={3} width={78} height={52} />
      {[0, 1, 2].map(bar => <rect key={bar} x={140 + bar * 5} y={40 - bar * 7} width={3} height={8 + bar * 7} rx={1} className={bar < WIFI_BARS[frame]! ? "ax-preview-chosen" : "ax-preview-track"} />)}
    </Scene>
  );
}

function CacheControlScene({ frame }: SceneProps) {
  return (
    <Scene>
      {SERVER_ROWS.map((y, index) => {
        const failed = index === 0 && frame >= 1;
        const chosen = index === 1 && frame === 3;
        return (
          <g key={y} className={failed ? "ax-preview-ruled-out" : undefined}>
            <ServerRow x={1} y={y} width={70} active={chosen} />
            {!chosen && <Mark x={60} y={y + 11} kind={failed ? "no" : "yes"} />}
            {chosen && <text x={60} y={y + 11} textAnchor="middle" className="ax-preview-text is-chosen">{"✓"}</text>}
            <Route from={[71, y + 7.5]} to={[100, 29]} active={frame === 0} />
          </g>
        );
      })}
      <Box x={100} y={4} width={55} height={50} />
      <rect x={118} y={1} width={19} height={6} rx={1} className="ax-preview-solid" />
      {[16, 29, 42].map((y, index) => {
        const marked = index === 0 && frame >= 2;
        return (
          <g key={y}>
            <Mark x={111} y={y + 3} kind={marked ? "no" : "yes"} />
            <rect x={120} y={y} width={27} height={3} rx={1} className={marked ? "ax-preview-chosen" : "ax-preview-track"} />
          </g>
        );
      })}
    </Scene>
  );
}

const COPY_START = 22;
const COPY_DONE = SERVER_LEFT - 13;

function AssetsScene({ frame }: SceneProps) {
  const copying = frame >= 2;
  return (
    <Scene>
      <Picture x={1} y={13} width={46} height={32} />
      <Box x={1} y={13} width={46} height={32} />
      {[4, 13, 22, 31, 40].flatMap(x => [8, 47].map(y => <rect key={`${x}-${y}`} x={x} y={y} width={5} height={3} rx={0.5} className="ax-preview-solid" />))}
      {frame === 1 && <circle cx={38} cy={21} r={7} className="ax-preview-stop" />}
      {frame === 1 && <Mark x={38} y={24} kind="yes" />}
      {SERVER_ROWS.map(y => (
        <g key={y}>
          <Route from={[47, 29]} to={[SERVER_LEFT, y + 7.5]} active={copying} />
          <ServerRow x={SERVER_LEFT} y={y} width={SCENE_WIDTH - SERVER_LEFT - 1} active={frame === 3} />
          {frame === 2 && <rect width={8} height={8} rx={1} className="ax-preview-chosen ax-preview-move" style={{ transform: `translate(${COPY_DONE}px, ${y + 3.5}px)` }} />}
          {frame < 2 && <rect width={8} height={8} rx={1} className="ax-preview-hidden" style={{ transform: `translate(${COPY_START}px, 25px)` }} />}
        </g>
      ))}
    </Scene>
  );
}

const VIDEO_SIZES = [
  { label: "TV", x: 64, y: 12, width: 34, height: 28 },
  { label: "Laptop", x: 103, y: 18, width: 26, height: 22 },
  { label: "Phone", x: 136, y: 16, width: 14, height: 24 },
] as const;

function EncodingScene({ frame }: SceneProps) {
  return (
    <Scene>
      <Picture x={1} y={10} width={48} height={38} />
      <Box x={1} y={10} width={48} height={38} />
      <Route from={[49, 29]} to={[62, 29]} active={frame > 0} />
      {VIDEO_SIZES.map((size, index) => {
        const made = frame > index;
        const current = frame === index + 1;
        return (
          <g key={size.label}>
            <Picture x={size.x} y={size.y} width={size.width} height={size.height} hidden={!made} />
            <Box x={size.x} y={size.y} width={size.width} height={size.height} />
            {current && <rect x={size.x - 1} y={size.y - 1} width={size.width + 2} height={size.height + 2} rx={3} className="ax-preview-selected" />}
            <Label x={size.x + size.width / 2} y={51} anchor="middle" strong={made}>{size.label}</Label>
          </g>
        );
      })}
    </Scene>
  );
}

const JOURNEY = [
  { label: "Prepare", x: 16 },
  { label: "Press play", x: 58 },
  { label: "Find", x: 100 },
  { label: "Watch", x: 138 },
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

export const NETFLIX_SCENES: Record<NetflixStepId, ComponentType<SceneProps>> = {
  viewer: ViewerScene,
  gateway: GatewayScene,
  discovery: DiscoveryScene,
  data: HistoryScene,
  cache: CacheScene,
  playback: PlaybackScene,
  steering: SteeringScene,
  cdn: OpenConnectScene,
  "cache-control": CacheControlScene,
  assets: AssetsScene,
  encoding: EncodingScene,
  review: ReviewScene,
};
