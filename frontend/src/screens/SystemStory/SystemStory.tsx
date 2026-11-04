"use client"

// Adapted from Redesign ARCHITECH Platform: landing-only reference components.

import { useState, type ReactNode } from "react"
import LandingWorkspacePreview from "./LandingWorkspacePreview"
import { LANDING_NODES, runLandingSimulation } from "./landingSimulation"

import { Logo } from "../../components/ui"

import "./SystemStory.css"

type IconName = "logo" | "arrow" | "play" | "plus" | "sun" | "moon" | "monitor" | "github" | "google" | "apple" | "home" | "folder" | "trophy" | "book" | "target" | "settings" | "search" | "bell" | "chevron" | "clock" | "more" | "server" | "database" | "globe" | "layers" | "code" | "cpu" | "check" | "back" | "undo" | "redo" | "download" | "share" | "sparkle" | "send" | "panel" | "zoomIn" | "zoomOut" | "maximize" | "mouse" | "hand" | "message" | "activity" | "shield" | "git" | "menu" | "close" | "user" | "logout" | "external" | "link" | "box" | "cloud" | "queue"

const paths: Record<IconName, ReactNode> = {
  logo: (
    <>
      <path d="M7 4.5 3.5 6.6v4.2L7 13l3.5-2.2V6.6L7 4.5Z" />
      <path d="m10.5 6.6 3.5 2.1v4.2L10.5 15 7 12.9" />
      <path d="M7 4.5 10.5 2 14 4.1v4.6" />
    </>
  ),

  arrow: (
    <>
      <path d="M3 8h10" />
      <path d="m10 4 4 4-4 4" />
    </>
  ),

  play: <path d="m6 3 8 5-8 5V3Z" />,

  plus: (
    <>
      <path d="M8 3v10M3 8h10" />
    </>
  ),

  sun: (
    <>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M13 3l-1 1M4 12l-1 1" />
    </>
  ),

  moon: <path d="M13.5 10.4A5.8 5.8 0 0 1 5.6 2.5 6 6 0 1 0 13.5 10.4Z" />,

  monitor: (
    <>
      <rect x="2" y="3" width="12" height="9" rx="1.5" />
      <path d="M6 15h4M8 12v3" />
    </>
  ),

  github: (
    <path d="M8 1.8a6.3 6.3 0 0 0-2 12.3c.3.1.4-.1.4-.3v-1.1c-1.8.4-2.2-.8-2.2-.8-.3-.8-.7-1-1-1.1-.6-.4 0-.4 0-.4.7 0 1.1.7 1.1.7.6 1.1 1.7.8 2.1.6.1-.5.3-.8.5-1-1.5-.1-3-.7-3-3.1 0-.7.2-1.2.7-1.7-.1-.2-.3-.8.1-1.7 0 0 .6-.2 1.8.6a6.5 6.5 0 0 1 3.3 0c1.2-.8 1.8-.6 1.8-.6.4.9.2 1.5.1 1.7.5.5.7 1 .7 1.7 0 2.4-1.5 3-3 3.1.3.2.5.6.5 1.2v1.8c0 .2.1.4.5.3A6.3 6.3 0 0 0 8 1.8Z" />
  ),

  google: (
    <>
      <path d="M14 8.2c0-.5 0-.8-.1-1.2H8v2.3h3.4a3 3 0 0 1-1.3 1.9v1.5h2a6 6 0 0 0 1.9-4.5Z" />
      <path d="M8 14.3c1.7 0 3.1-.5 4.1-1.6l-2-1.5c-.5.4-1.2.6-2.1.6a3.6 3.6 0 0 1-3.4-2.5H2.5v1.6A6.2 6.2 0 0 0 8 14.3Z" />
      <path d="M4.6 9.3A3.8 3.8 0 0 1 4.4 8c0-.5 0-.9.2-1.3V5.1H2.5A6.3 6.3 0 0 0 1.8 8c0 1 .2 2 .7 2.9l2.1-1.6Z" />
      <path d="M8 4.2c.9 0 1.8.3 2.4 1l1.8-1.8A6 6 0 0 0 8 1.7a6.2 6.2 0 0 0-5.5 3.4l2.1 1.6A3.6 3.6 0 0 1 8 4.2Z" />
    </>
  ),

  apple: (
    <>
      <path d="M11.2 8.5c0-1.7 1.4-2.5 1.5-2.6a3.1 3.1 0 0 0-2.5-1.3c-1-.1-2 .6-2.5.6-.5 0-1.3-.6-2.1-.6-1.1 0-2.1.6-2.6 1.6-1.1 2-.3 4.8.8 6.4.5.8 1.2 1.7 2 1.6.8 0 1.1-.5 2.1-.5s1.3.5 2.1.5c.9 0 1.4-.8 2-1.6.6-.9.9-1.8.9-1.9-.1 0-1.7-.7-1.7-2.2Z" />
      <path d="M9.5 3.5c.4-.5.7-1.3.6-2-.7 0-1.5.5-2 1-.4.5-.7 1.2-.6 1.9.7.1 1.5-.4 2-.9Z" />
    </>
  ),

  home: (
    <>
      <path d="m2 7 6-5 6 5v7H9.8V9.5H6.2V14H2V7Z" />
    </>
  ),

  folder: <path d="M2 4.5h4l1.2 1.3H14v7.7H2v-9Z" />,

  trophy: (
    <>
      <path d="M5 2h6v3.7a3 3 0 0 1-6 0V2Z" />
      <path d="M5 4H2v1.2C2 7 3.3 8 5 8M11 4h3v1.2C14 7 12.7 8 11 8M8 9v3M5.5 14h5" />
    </>
  ),

  book: (
    <>
      <path d="M2.5 3.5h3A2.5 2.5 0 0 1 8 6v7a2.5 2.5 0 0 0-2.5-2.5h-3v-7Z" />
      <path d="M13.5 3.5h-3A2.5 2.5 0 0 0 8 6v7a2.5 2.5 0 0 1 2.5-2.5h3v-7Z" />
    </>
  ),

  target: (
    <>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r=".5" />
    </>
  ),

  settings: (
    <>
      <circle cx="8" cy="8" r="2.3" />
      <path d="M6.7 1.8h2.6l.4 1.5 1 .4 1.4-.8 1.3 1.3-.8 1.4.4 1 1.5.4v2l-1.5.4-.4 1 .8 1.4-1.3 1.3-1.4-.8-1 .4-.4 1.5H6.7l-.4-1.5-1-.4-1.4.8-1.3-1.3.8-1.4-.4-1L1.5 9V7L3 6.6l.4-1-.8-1.4 1.3-1.3 1.4.8 1-.4.4-1.5Z" />
    </>
  ),

  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3.5 3.5" />
    </>
  ),

  bell: (
    <>
      <path d="M3 11h10l-1.2-1.7V6a3.8 3.8 0 0 0-7.6 0v3.3L3 11Z" />
      <path d="M6.5 13.5h3" />
    </>
  ),

  chevron: <path d="m5 6 3 3 3-3" />,

  clock: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </>
  ),

  more: (
    <>
      <circle cx="3" cy="8" r=".7" />
      <circle cx="8" cy="8" r=".7" />
      <circle cx="13" cy="8" r=".7" />
    </>
  ),

  server: (
    <>
      <rect x="2" y="2.5" width="12" height="4.5" rx="1" />
      <rect x="2" y="9" width="12" height="4.5" rx="1" />
      <path d="M4.5 4.8h.1M4.5 11.3h.1M7 4.8h5M7 11.3h5" />
    </>
  ),

  database: (
    <>
      <ellipse cx="8" cy="3.5" rx="5" ry="2" />
      <path d="M3 3.5v4c0 1.1 2.2 2 5 2s5-.9 5-2v-4M3 7.5v4c0 1.1 2.2 2 5 2s5-.9 5-2v-4" />
    </>
  ),

  globe: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.7 1.7 2.5 3.7 2.5 6S9.7 12.3 8 14M8 2C6.3 3.7 5.5 5.7 5.5 8s.8 4.3 2.5 6" />
    </>
  ),

  layers: (
    <>
      <path d="m8 2 6 3-6 3-6-3 6-3Z" />
      <path d="m2 8 6 3 6-3M2 11l6 3 6-3" />
    </>
  ),

  code: (
    <>
      <path d="m6 4-4 4 4 4M10 4l4 4-4 4" />
    </>
  ),

  cpu: (
    <>
      <rect x="4" y="4" width="8" height="8" rx="1" />
      <path d="M6.5 1v3M9.5 1v3M6.5 12v3M9.5 12v3M1 6.5h3M1 9.5h3M12 6.5h3M12 9.5h3" />
      <rect x="6.5" y="6.5" width="3" height="3" />
    </>
  ),

  check: <path d="m3 8 3 3 7-7" />,

  back: <path d="M13 8H3m4-4L3 8l4 4" />,

  undo: (
    <>
      <path d="M5 5H2V2" />
      <path d="M2.5 5.5A6 6 0 1 1 3 11" />
    </>
  ),

  redo: (
    <>
      <path d="M11 5h3V2" />
      <path d="M13.5 5.5A6 6 0 1 0 13 11" />
    </>
  ),

  download: (
    <>
      <path d="M8 2v8m-3-3 3 3 3-3M2.5 13.5h11" />
    </>
  ),

  share: (
    <>
      <circle cx="4" cy="8" r="1.5" />
      <circle cx="12" cy="3.5" r="1.5" />
      <circle cx="12" cy="12.5" r="1.5" />
      <path d="m5.3 7.2 5.4-3M5.3 8.8l5.4 3" />
    </>
  ),

  sparkle: (
    <>
      <path d="m8 1 1.3 4.2L13.5 6.5 9.3 7.8 8 12 6.7 7.8 2.5 6.5l4.2-1.3L8 1Z" />
      <path d="m13 10 .6 1.8 1.9.7-1.9.6L13 15l-.6-1.9-1.9-.6 1.9-.7L13 10Z" />
    </>
  ),

  send: <path d="m2 2 12 6-12 6 2-5 6-1-6-1-2-5Z" />,

  panel: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M10 2.5v11" />
    </>
  ),

  zoomIn: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M7 5v4M5 7h4m5 7-3.5-3.5" />
    </>
  ),

  zoomOut: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M5 7h4m5 7-3.5-3.5" />
    </>
  ),

  maximize: (
    <>
      <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
    </>
  ),

  mouse: (
    <>
      <rect x="4" y="1.5" width="8" height="13" rx="4" />
      <path d="M8 1.5V6" />
    </>
  ),

  hand: (
    <path d="M5 8V4.5a1 1 0 0 1 2 0V7M7 6V3a1 1 0 0 1 2 0v4M9 6V4a1 1 0 0 1 2 0v4M11 6.5V5a1 1 0 0 1 2 0v4c0 3-2 5-5 5H7c-1.5 0-2.4-.6-3.3-1.8L2 10a1 1 0 0 1 1.5-1.3L5 10" />
  ),

  message: <path d="M2 3h12v8H7l-3.5 3v-3H2V3Z" />,

  activity: <path d="M1.5 8h3l1.5-4 3 8 1.5-4h4" />,

  shield: (
    <>
      <path d="M8 1.5 13 3v4c0 3.4-2 5.7-5 7.5C5 12.7 3 10.4 3 7V3l5-1.5Z" />
      <path d="m5.5 8 1.5 1.5 3.5-4" />
    </>
  ),

  git: (
    <>
      <circle cx="4" cy="3" r="1.5" />
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="4" cy="13" r="1.5" />
      <path d="M4 4.5v7M5.5 5.5h3A3.5 3.5 0 0 0 12 5" />
    </>
  ),

  menu: <path d="M2 4h12M2 8h12M2 12h12" />,

  close: <path d="m3 3 10 10M13 3 3 13" />,

  user: (
    <>
      <circle cx="8" cy="5" r="3" />
      <path d="M2.5 14c.5-3 2.3-4.5 5.5-4.5s5 1.5 5.5 4.5" />
    </>
  ),

  logout: (
    <>
      <path d="M7 2H3v12h4M10 5l3 3-3 3M6 8h7" />
    </>
  ),

  external: (
    <>
      <path d="M9 2h5v5M14 2 7.5 8.5" />
      <path d="M12 9v4H3V4h4" />
    </>
  ),

  link: (
    <>
      <path d="M6.5 10.5 5 12a2.1 2.1 0 0 1-3-3l2.5-2.5a2.1 2.1 0 0 1 3 0" />
      <path d="m9.5 5.5 1.5-1.5a2.1 2.1 0 0 1 3 3l-2.5 2.5a2.1 2.1 0 0 1-3 0M5.5 10.5l5-5" />
    </>
  ),

  box: (
    <>
      <path d="m8 1.5 5.5 3v7L8 14.5l-5.5-3v-7l5.5-3Z" />
      <path d="m2.5 4.5 5.5 3 5.5-3M8 7.5v7" />
    </>
  ),

  cloud: (
    <path d="M4 12.5a3 3 0 0 1-.5-6A4.5 4.5 0 0 1 12 6a3.3 3.3 0 0 1 .5 6.5H4Z" />
  ),

  queue: (
    <>
      <path d="M2 4h12M2 8h12M2 12h12" />
      <circle cx="4" cy="4" r="1" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
}

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function Button({
  children,

  variant = "primary",

  icon,

  onClick,

  className = "",

  type = "button",
}: {
  children?: ReactNode

  variant?: "primary" | "secondary" | "ghost" | "icon"

  icon?: IconName

  onClick?: () => void

  className?: string

  type?: "button" | "submit"
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${className}`}
      onClick={onClick}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  )
}

function MiniArchitecture({ large = false }: { large?: boolean }) {
  return (
    <div className={`mini-architecture ${large ? "large" : ""}`}>
      <svg
        className="connections"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <path d="M19 49 C28 49 28 25 38 25" />
        <path d="M19 51 C28 51 28 71 38 71" />
        <path d="M51 25 C58 25 61 25 69 25" />
        <path d="M51 71 C59 71 61 25 69 25" />
        <path d="M78 34v30" />
      </svg>
      {LANDING_NODES.map((node) => (
        <div
          className="arch-node"
          key={node.label}
          style={{ left: `${node.x}%`, top: `${node.y}%` }}
        >
          <span>
            <Icon name={node.icon} />
          </span>
          <div>
            <b>{node.label}</b>
            {large && <small>{node.meta}</small>}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function SystemStory({
  onGetStarted,
}: {
  onGetStarted: () => void
}) {
  const [traffic, setTraffic] = useState(1240)
  const [runId, setRunId] = useState(0)
  const [result, setResult] = useState<ReturnType<typeof runLandingSimulation> | null>(null)
  const [simulationError, setSimulationError] = useState<string | null>(null)
  const runSimulation = () => {
    try {
      setResult(runLandingSimulation(traffic))
      setRunId(value => value + 1)
      setSimulationError(null)
    } catch (error) {
      setResult(null)
      setSimulationError(error instanceof Error ? error.message : "Simulation failed. Try again.")
    }
  }
  const limitingNode = LANDING_NODES.find(node => node.id === result?.limitingNodeId)
  return (
    <section
      className="reference-landing"
      id="system-story"
      aria-label="Explore ARCHITECH"
    >
      <div className={`product-preview ${result ? "has-simulation" : ""}`}>
        <LandingWorkspacePreview onRun={runSimulation} result={result} runId={runId} onGetStarted={onGetStarted} />
        <div className="preview-simulation">
          <label htmlFor="landing-traffic">Traffic</label>
          <select id="landing-traffic" value={traffic} onChange={event => {
            setTraffic(Number(event.target.value))
            setResult(null)
            setSimulationError(null)
          }}>
            <option value={1240}>1,240 req/s</option>
            <option value={2480}>2,480 req/s ? 2? traffic</option>
            <option value={12400}>12,400 req/s ? 10? traffic</option>
          </select>
          <span>Local model ? example topology</span>
        </div>
        <div id="landing-simulation-results" role="status" aria-live="polite" className="preview-results">
          {simulationError ? <p>{simulationError}</p> : result ? <>
            <dl>
              <div><dt>Throughput</dt><dd>{result.metrics.effectiveRps.toLocaleString()} req/s</dd></div>
              <div><dt>p95 latency</dt><dd>{result.metrics.p95LatencyMs.toLocaleString()} ms</dd></div>
              <div><dt>Requests served</dt><dd>{(100 * result.metrics.effectiveRps / result.metrics.requestedRps).toFixed(1)}%</dd></div>
              <div><dt>Capacity constraint</dt><dd>{limitingNode?.label ?? "None"}</dd></div>
            </dl>
            <p>Model estimates for this example, not measurements of deployed infrastructure.</p>
          </> : <p>Select traffic and run the example architecture.</p>}
        </div>
      </div>

      <section className="section" id="product">
        <div className="section-head">
          <div>
            <div className="eyebrow">One connected workspace</div>
            <h2>From blank canvas to confident architecture.</h2>
          </div>
          <p>
            Every tool you need to design, explain, test, and improve
            distributed systems—without switching context.
          </p>
        </div>
        <div className="feature-grid">
          <article className="feature-card feature-wide">
            <div className="feature-copy">
              <span className="feature-icon">
                <Icon name="layers" />
              </span>
              <h3>Build visually, think structurally</h3>
              <p>
                Compose real infrastructure components on an intelligent canvas.
                Connections stay clear as your system grows.
              </p>
              <button onClick={() => onGetStarted()}>
                Explore the workspace <Icon name="arrow" />
              </button>
            </div>
            <div className="feature-visual canvas-visual">
              <MiniArchitecture large />
            </div>
          </article>
          <article className="feature-card">
            <div className="feature-copy">
              <span className="feature-icon">
                <Icon name="sparkle" />
              </span>
              <h3>Meet Archie, your architecture copilot</h3>
              <p>
                Get contextual explanations and practical improvements grounded
                in your actual design.
              </p>
            </div>
            <div className="archie-demo">
              <span>
                <Icon name="sparkle" />
              </span>
              <div>
                <b>Example architecture review</b>
                <p>Inspect redundancy and failure paths</p>
              </div>
              <i>Review</i>
            </div>
          </article>
          <article className="feature-card">
            <div className="feature-copy">
              <span className="feature-icon">
                <Icon name="activity" />
              </span>
              <h3>See your system under pressure</h3>
              <p>
                Simulate traffic, identify bottlenecks, and understand tradeoffs
                before they become incidents.
              </p>
            </div>
            <div className="metrics-demo">
              <div>
                <span>Requests/sec</span>
                <b>12.4k</b>
                <small>Example traffic</small>
              </div>
              <svg viewBox="0 0 280 74">
                <path d="M0 62 C22 60 28 52 45 55 S73 64 90 44 120 51 137 36 166 41 182 26 211 35 226 17 252 22 280 8" />
                <path
                  className="area"
                  d="M0 62 C22 60 28 52 45 55 S73 64 90 44 120 51 137 36 166 41 182 26 211 35 226 17 252 22 280 8V74H0Z"
                />
              </svg>
            </div>
          </article>
        </div>
      </section>
      <section className="steps-section">
        <div className="eyebrow">How it works</div>
        <h2>A clearer path from idea to architecture.</h2>
        <div className="steps">
          {[
            [
              "01",

              "Start with intent",

              "Describe your system or import a GitHub repository.",
            ],

            [
              "02",

              "Design together",

              "Build on canvas while Archie surfaces tradeoffs.",
            ],

            [
              "03",

              "Test and understand",

              "Simulate behavior and turn feedback into decisions.",
            ],
          ].map((s) => (
            <div className="step" key={s[0]}>
              <span>{s[0]}</span>
              <h3>{s[1]}</h3>
              <p>{s[2]}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="final-cta">
        <div>
          <span className="brand-mark">
            <Icon name="logo" size={28} />
          </span>
          <h2>Build the system you can explain.</h2>
          <p>Design, inspect, and test your architecture in one workspace.</p>
          <Button onClick={() => onGetStarted()}>
            Start building <Icon name="arrow" />
          </Button>
        </div>
        <MiniArchitecture large />
      </section>
      <footer>
        <Logo />
        <span>
          Build architectures. Understand systems. Learn through simulation.
        </span>
        <small>© {new Date().getFullYear()} ARCHITECH</small>
      </footer>
    </section>
  )
}
