import { heroVideoLayout } from "./heroModel"
import { connectorPath, phases, sampleTimeline, sketchNode, nodeKinds, type NodeKind, type Pose } from "./heroModel"
import "./archie-hero.css"
import { useId, useRef, type ReactNode } from "react"
import { useHeroPlayback } from "./useHeroPlayback"

const videoUrl = "/archie-hero/archie-hero.mp4"
const posterUrl = "/archie-hero/archie-hero-poster.webp"

const initial = sampleTimeline(0).poses
const installed = sampleTimeline(2500).poses
const videoPosition = {
  left: `${heroVideoLayout.x / 650 * 100}%`,
  top: `${heroVideoLayout.y / 500 * 100}%`,
  width: `${heroVideoLayout.width / 650 * 100}%`,
}
export function ArchieHero({
  actions,
}: {
  actions: ReactNode
}) {
  const inkFilter = useId()
  const ref = useRef<HTMLElement>(null)
  useHeroPlayback(ref)
  return (
    <section
      className="landing-intro animated-hero"
      ref={ref}
      data-phase="build"
      data-playing="false"
      aria-label="Build, break, and understand systems"
    >
      <div className="landing-intro-copy ah-copy">
        <h1 className="landing-intro-title" aria-label="Build, break, understand systems.">
          <span className="ah-word-slot" aria-hidden="true">
            {phases.map((phase, i) => (
              <span
                data-word={i}
                key={phase.name}
                style={{ opacity: i === 0 ? 1 : 0 }}
              >
                {phase.name}
              </span>
            ))}
          </span>
          <span className="ah-systems" aria-hidden="true">
            systems.
          </span>
        </h1>
        <p className="landing-intro-description ah-tagline">Think like an architect.</p>
        <div className="landing-intro-actions">
          {actions}
        </div>
      </div>
      <div className="ah-stage">
        <svg className="ah-scene" viewBox="0 0 650 500" aria-hidden="true">
          <defs>
            <filter id={inkFilter} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
              <feTurbulence data-ink-noise="true" type="fractalNoise" baseFrequency=".075" numOctaves="1" seed="1" result="ink" />
              <feDisplacementMap in="SourceGraphic" in2="ink" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
          <ellipse
            className="ah-ground-shadow"
            cx="153"
            cy="369"
            rx="92"
            ry="14"
            fill="#0878ff"
            opacity=".06"
          />
          {nodeKinds.map((kind, i) => (
            <g
              key={`guide-${kind}`}
              data-placement-guide={i}
              className={`ah-placement-guide ah-${kind}`}
              transform={`translate(${installed[i].x} ${installed[i].y})`}
            >
              <rect x="-62" y="-47" width="120" height="88" rx="12" />
              <path className="ah-guide-grid" d="M-22-47v88M18-47v88M-62-25H58M-62-3H58M-62 19H58" />
            </g>
          ))}
          {initial.slice(1, 4).map((pose, i) => (
            <Connector
              key={i}
              index={i}
              path={connectorPath(initial[0], pose)}
            />
          ))}
          {nodeKinds.map((kind, i) => (
            <SystemNode key={kind} kind={kind} pose={initial[i]} inkFilter={inkFilter} />
          ))}
          <Archie pose={initial[4]} />
          <path
            className="ah-aha"
            d="m225 205 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z"
            fill="var(--ah-accent)"
          />
        </svg>
        <div className="ah-video-overlay" aria-hidden="true">
          <video
            className="ah-archie-video"
            style={videoPosition}
            src={videoUrl}
            poster={posterUrl}
            muted
            loop
            playsInline
            preload="auto"
            tabIndex={-1}
          />
          <canvas className="ah-character-frame" style={videoPosition}
            width={heroVideoLayout.sourceWidth} height={heroVideoLayout.sourceHeight} />
        </div>
        <div className="ah-diagram-labels" aria-hidden="true">
          <span className="ah-label-component">Gateway</span>
          <span className="ah-label-analytics">Charts</span>
          <span className="ah-label-processor">Service</span>
          <span className="ah-label-database">Database</span>
        </div>
      </div>
    </section>
  )
}

// Scene elements stay private to the public hero component.
const iconKinds: NodeKind[] = [...nodeKinds, "search", "cache", "queue", "worker", "api", "storage", "router", "client"]
function NodeIcon({ kind }: { kind: NodeKind }) {
  switch (kind) {
    case "component":
      return <path d="M-12-18h24v36h-24Z M-25 0h15m-7-7 7 7-7 7M10 0h15m-7-7 7 7-7 7" />
    case "router":
      return <><circle r="7" /><path d="M0-7v-10M0 7v10M-7 0h-10M7 0h10" /><circle cy="-21" r="4" /><circle cy="21" r="4" /><circle cx="-21" r="4" /><circle cx="21" r="4" /></>
    case "client":
      return <><rect x="-22" y="-17" width="44" height="29" rx="3" /><path d="M0 12v9M-12 21h24M-22 5h44" /></>
    case "processor":
      return <><path strokeWidth="7" d="M0-20v9M0 11v9M-20 0h9M11 0h9M-14-14l7 7M7 7l7 7M-14 14l7-7M7-7l7-7" /><circle r="12" /><circle r="4" /></>
    case "database":
      return <><ellipse cy="-13" rx="15" ry="6" /><path d="M-15-13v26c0 8 30 8 30 0v-26M-15 0c0 8 30 8 30 0" /></>
    case "analytics":
      return <g fill="currentColor" stroke="none"><rect x="-17" y="4" width="8" height="15" rx="1" /><rect x="-4" y="-6" width="8" height="25" rx="1" /><rect x="9" y="-19" width="8" height="38" rx="1" /></g>
    case "search":
      return <><circle cx="-5" cy="-5" r="13" /><path d="m5 5 14 14" strokeWidth="5" /></>
    case "cache":
      return <><rect x="-20" y="-20" width="40" height="40" rx="5" /><path d="M4-14-8 3H2l-6 12L9-3H0Z" fill="currentColor" strokeWidth="1" /></>
    case "queue":
      return <><rect x="-22" y="-18" width="26" height="9" rx="2" /><rect x="-22" y="-4" width="26" height="9" rx="2" /><rect x="-22" y="10" width="26" height="9" rx="2" /><path data-queue-arrow="true" d="M10 0h13m-7-7 7 7-7 7" /><g data-queue-backlog="true" fill="currentColor" stroke="none" opacity="0"><circle cx="16" cy="-14" r="4" /><circle cx="16" r="4" /><circle cx="16" cy="14" r="4" /></g></>
    case "worker":
      return <><path d="m-17 16 19-19M-1-12l13 13 8-8-13-13Z" strokeWidth="4" /><path d="m-21 12 9 9" strokeWidth="5" /></>
    case "api":
      return <path d="m-9-13-13 13 13 13M9-13l13 13-13 13M5-20-5 20" strokeWidth="4" />
    case "storage":
      return <><path d="M-22-14h16l6 7h22v25h-44Z" /><path d="M-22-7v-13H0l6 6h16v7" /></>
  }
}
function SystemNode({
  kind,
  pose,
  inkFilter,
}: {
  inkFilter: string
  kind: typeof nodeKinds[number]
  pose: Pose
}) {
  return (
    <g
      data-actor={kind}
      className={`ah-node ah-${kind}`}
      transform={`translate(${pose.x} ${pose.y}) rotate(${pose.angle})`}
    >
      <g className="ah-node-visual">
      <path className="ah-node-side" d={sketchNode(0, nodeKinds.indexOf(kind))} transform="translate(6 4)" />
      <path className="ah-node-face" d={sketchNode(0, nodeKinds.indexOf(kind))} />
      <circle cx="-60" cy="0" r="5" />
      <circle cx="58" cy="0" r="5" />
      <rect className="ah-node-activation" x="-58" y="-43" width="112" height="82" rx="12" />
      <path className="ah-node-focus" d="M-47-49h-17v17M43-49h17v17M-64 28v17h17M60 28v17H43" />
      <g
        className="ah-node-icon"
        filter={`url(#${inkFilter})`}
        strokeLinecap="round"
        transform="translate(0 -15) scale(.72)"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      >
        {iconKinds.map(iconKind => (
          <g key={iconKind} data-node-icon={iconKind} style={{ display: iconKind === kind ? "inline" : "none" }}>
            <NodeIcon kind={iconKind} />
          </g>
        ))}
      </g>
      <path className="ah-node-scan" d="M-45 0h86" />
      </g>
    </g>
  )
}
function Connector({ index, path }: { index: number; path: string }) {
  return (
    <g className="ah-connector">
      <path data-wire={index} d={path} pathLength="100" />
      <path data-flow={index} d={path} pathLength="100" className="ah-flow" />
    </g>
  )
}
function Archie({ pose }: { pose: Pose }) {
  return (
    <g data-actor="archie" transform={`translate(${pose.x} ${pose.y})`}>
      <g transform="translate(-82 -70) scale(.88)">
        {/* Smooth, symmetric arch and level feet follow the mascot reference. */}
        <path
          className="ah-archie-body"
          fill="#008fff"
          d="M98.5 0C50 0 15 39 15 88V168H8a8 8 0 0 0 0 16h53a8 8 0 0 0 8-8v-46c0-17 13-30 29.5-30s29.5 13 29.5 30v46a8 8 0 0 0 8 8h53a8 8 0 0 0 0-16h-7V88C182 39 147 0 98.5 0Z"
        />
        <g className="ah-face" stroke="#071841" strokeLinecap="round" strokeLinejoin="round">
          <path d="M88 64q10.5-9 21 0M34 67h-5M163 67h5" fill="none" strokeWidth="6" />
          <circle cx="63" cy="67" r="25" fill="white" strokeWidth="7" />
          <circle cx="134" cy="67" r="25" fill="white" strokeWidth="7" />
          <g className="ah-pupils" data-eyes="true" fill="#071841" stroke="none">
            <path data-eye="left" d="M71 67a8 11 0 1 0-16 0a8 11 0 1 0 16 0" />
            <path data-eye="right" d="M142 67a8 11 0 1 0-16 0a8 11 0 1 0 16 0" />
          </g>
        </g>
        <g className="ah-magnifier" fill="none" stroke="#071841" strokeLinecap="round">
          <path d="m193 107-15 32" strokeWidth="9" />
          <circle cx="213" cy="85" r="29" fill="white" fillOpacity=".4" strokeWidth="5" />
        </g>
        <g className="ah-hands" fill="#008fff">
          <circle className="ah-hand-left" cx="-8" cy="142" r="17" />
          <circle className="ah-hand-right" cx="200" cy="119" r="17" />
        </g>
      </g>
    </g>
  )
}
