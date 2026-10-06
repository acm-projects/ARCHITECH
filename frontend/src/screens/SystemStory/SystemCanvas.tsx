import type { ReactNode } from "react";

import {
  Activity,
  ArrowRight,
  Bot,
  Box,
  Check,
  ChevronRight,
  Cloud,
  Cpu,
  Database,
  GitFork,
  Globe,
  Layers3,
  Monitor,
  Play,
  Plus,
  Server,
  UserRound,
} from "lucide-react";

type ChallengeRequirement = {
  label: string;
  value: string;
};

const CHALLENGE_RESULT_ROWS: ChallengeRequirement[] = [
  { label: "Target latency", value: "< 200 ms" },
  { label: "Simulated latency", value: "142 ms" },
];

const CHALLENGE_REQUIREMENTS: ChallengeRequirement[] = [
  { label: "Concurrent users", value: "500K" },
  { label: "Request rate", value: "25K req/s" },
  { label: "Target latency", value: "< 200 ms" },
  { label: "Availability", value: "99.9%" },
  { label: "Read / Write", value: "80 / 20" },
];

/* =========================================================
   FINAL DEMO — REPOSITORY IMPORT (static demo content)
========================================================= */

const REPO_DEMO_URL = "github.com/jieCheong/studycast";

const REPO_DEMO_FINDINGS = [
  "API routes",
  "PostgreSQL",
  "Redis",
  "Background workers",
  "External AI services",
];

type RepoDemoComponent = {
  id: string;
  type: string;
  name: string;
  icon: ReactNode;
};

/* Order matches the build-up order in the timeline. */
const REPO_DEMO_COMPONENTS: RepoDemoComponent[] = [
  {
    id: "user",
    type: "CLIENT",
    name: "User",
    icon: <UserRound size={19} strokeWidth={1.7} />,
  },
  {
    id: "web",
    type: "FRONTEND",
    name: "Web App",
    icon: <Monitor size={19} strokeWidth={1.7} />,
  },
  {
    id: "api",
    type: "BACKEND",
    name: "API Server",
    icon: <Server size={19} strokeWidth={1.7} />,
  },
  {
    id: "redis",
    type: "CACHE",
    name: "Redis",
    icon: <Layers3 size={19} strokeWidth={1.7} />,
  },
  {
    id: "postgres",
    type: "DATA",
    name: "PostgreSQL",
    icon: <Database size={19} strokeWidth={1.7} />,
  },
  {
    id: "ai",
    type: "EXTERNAL",
    name: "AI Services",
    icon: <Globe size={19} strokeWidth={1.7} />,
  },
  {
    id: "queue",
    type: "QUEUE",
    name: "Job Queue",
    icon: <Box size={19} strokeWidth={1.7} />,
  },
  {
    id: "worker",
    type: "WORKER",
    name: "Audio Worker",
    icon: <Cpu size={19} strokeWidth={1.7} />,
  },
];

/*
 * Connection paths in the 560 × 538 architecture frame.
 * Node frame: 148 × 62; columns centred at x = 80 / 280 / 480.
 * Rows (top): 0 / 92 / 184 / 292 / 384 / 476. Lines run from a
 * node's bottom edge to the next node's top edge.
 */
const REPO_DEMO_LINES = [
  { id: "user-web", d: "M280 62 V92" },
  { id: "web-api", d: "M280 154 V184" },
  { id: "api-redis", d: "M280 246 C280 274 80 264 80 292" },
  { id: "api-postgres", d: "M280 246 V292" },
  { id: "api-ai", d: "M280 246 C280 274 480 264 480 292" },
  { id: "redis-queue", d: "M80 354 V384" },
  { id: "queue-worker", d: "M80 446 V476" },
];

function GitHubMark() {
  return (
    <svg
      className="repo-demo-github"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

type StoryNodeProps = {
  type: string;
  name: string;
  icon: ReactNode;
  className?: string;
};

function StoryNode({
  type,
  name,
  icon,
  className = "",
}: StoryNodeProps) {
  return (
    <div className={`story-node ${className}`}>
      <div className="story-node-icon">{icon}</div>

      <div className="story-node-copy">
        <span>{type}</span>
        <strong>{name}</strong>
      </div>

    </div>
  );
}

type ToolboxItemProps = {
  icon: ReactNode;
  name: string;
};

function ToolboxItem({ icon, name }: ToolboxItemProps) {
  return (
    <div className="learn-toolbox-item">
      <div className="learn-toolbox-icon">{icon}</div>

      <span>{name}</span>

      <Plus
        className="learn-toolbox-plus"
        size={12}
        strokeWidth={1.6}
      />
    </div>
  );
}

export default function SystemCanvas() {
  return (
    <div className="story-demo">
      {/* =====================================================
          STORY PROGRESS
      ===================================================== */}

      <div className="story-demo-progress">
        <span className="progress-build active">
          01 BUILD
        </span>

        <span className="progress-break">
          02 BREAK
        </span>

        <span className="progress-solve">
          03 SOLVE
        </span>

        <span className="progress-learn">
          04 LEARN
        </span>

        <span className="progress-challenge">
          05 CHALLENGE
        </span>

        {/* Single shared underline; GSAP moves it between items */}
        <div
          className="story-progress-indicator"
          aria-hidden="true"
        />
      </div>

      {/* =====================================================
          ARCHITECH PRODUCT WORKSPACE

          This shell exists from the very beginning.
      ===================================================== */}

      <div className="story-workspace">
        {/* ===================================================
            LEFT — COMPONENT LIBRARY
        =================================================== */}

        <aside className="learn-toolbox">
          <div className="learn-panel-heading">
            <div>
              <span>COMPONENTS</span>
              <strong>Build</strong>
            </div>

            <Plus size={14} strokeWidth={1.5} />
          </div>

          <div className="learn-toolbox-list">
            <ToolboxItem
              name="Client"
              icon={
                <UserRound
                  size={16}
                  strokeWidth={1.6}
                />
              }
            />

            <div className="toolbox-server">
            <ToolboxItem
                name="Server"
                icon={
                <Server
                    size={16}
                    strokeWidth={1.6}
                />
                }
            />
            </div>

            <div className="toolbox-database">
            <ToolboxItem
                name="Database"
                icon={
                <Database
                    size={16}
                    strokeWidth={1.6}
                />
                }
            />
            </div>

            <ToolboxItem
              name="Load Balancer"
              icon={
                <GitFork
                  size={16}
                  strokeWidth={1.6}
                />
              }
            />

            <div className="toolbox-cache">
              <ToolboxItem
                name="Cache"
                icon={
                  <Layers3
                    size={16}
                    strokeWidth={1.6}
                  />
                }
              />
            </div>

            <ToolboxItem
              name="Queue"
              icon={
                <Box
                  size={16}
                  strokeWidth={1.6}
                />
              }
            />

            <ToolboxItem
              name="CDN"
              icon={
                <Cloud
                  size={16}
                  strokeWidth={1.6}
                />
              }
            />
          </div>
        </aside>

        {/* ===================================================
            CENTER WORKSPACE
        =================================================== */}

        <main className="story-workspace-center">
          {/* =================================================
              SMALL CANVAS TOOLBAR
          ================================================= */}

          <div className="learn-canvas-toolbar">
            <div className="learn-project-name">
              <span className="learn-project-dot" />
              <span>Instagram</span>
            </div>

            <span className="learn-mode-pill">
              LEARN MODE
            </span>
          </div>

          {/* =================================================
              WHITE SYSTEM CANVAS
          ================================================= */}

          <div className="story-demo-canvas">
            {/* ===============================================
                BUILD AREA
            =============================================== */}

            <div className="story-build-area">
              {/* =============================================
                  USER
              ============================================= */}

              <div className="story-node-position story-user">
                <StoryNode
                  type="CLIENT"
                  name="User"
                  icon={
                    <UserRound
                      size={21}
                      strokeWidth={1.7}
                    />
                  }
                />
              </div>

              {/* =============================================
                  USER → ORIGINAL SERVER
              ============================================= */}

              <div className="story-connector connector-user-server">
                <span className="story-connector-line" />

                <span className="story-connector-arrow">
                  ↓
                </span>

                <span className="traffic-dot traffic-dot-one" />

                <span className="break-particle break-particle-1" />
                <span className="break-particle break-particle-2" />
                <span className="break-particle break-particle-3" />
                <span className="break-particle break-particle-4" />
                <span className="break-particle break-particle-5" />
                <span className="break-particle break-particle-6" />
              </div>

              {/* =============================================
                  SERVER LESSON
              ============================================= */}


              {/* =============================================
                  ORIGINAL SERVER
              ============================================= */}

              <div className="story-node-position story-server">
                <StoryNode
                  type="COMPUTE"
                  name="Server"
                  icon={
                    <Server
                      size={21}
                      strokeWidth={1.7}
                    />
                  }
                />

                <div className="server-warning">
                  <span>!</span>
                  OVERLOADED
                </div>
              </div>

              {/* =============================================
                  SERVER → DATABASE
              ============================================= */}

              <div className="story-connector connector-server-db">
                <span className="story-connector-line" />

                <span className="story-connector-arrow">
                  ↓
                </span>

                <span className="traffic-dot traffic-dot-two" />
              </div>

              {/* =============================================
                  DATABASE LESSON
              ============================================= */}

              

              {/* =============================================
                  DATABASE
              ============================================= */}

              <div className="story-node-position story-database">
                <StoryNode
                  type="DATA"
                  name="Database"
                  icon={
                    <Database
                      size={21}
                      strokeWidth={1.7}
                    />
                  }
                />
              </div>

              {/* =============================================
                  02 BREAK — TRAFFIC
              ============================================= */}

              <div className="break-traffic-panel">
                <div className="break-panel-heading">
                  <span>TRAFFIC</span>

                  <strong className="traffic-value">
                    100
                  </strong>
                </div>

                <div className="traffic-scale">
                  <div className="traffic-scale-track">
                    <span className="traffic-scale-fill" />
                    <span className="traffic-scale-thumb" />
                  </div>

                  <div className="traffic-scale-labels">
                    <span>100</span>
                    <span>1K</span>
                    <span>10K</span>
                    <span>100K</span>
                  </div>
                </div>
              </div>

              {/* =============================================
                  02 BREAK — FAILURE RESULT
              ============================================= */}

              <div className="break-result">
                <span className="break-result-eyebrow">
                  SYSTEM FAILURE
                </span>

                <strong>
                  YOU BROKE IT.
                </strong>

                <p>
                  One server can't handle everyone at once.
                </p>
              </div>

              {/* =============================================
                  03 SOLVE — QUESTION
              ============================================= */}

              <div className="solve-panel">
                <span className="solve-eyebrow">
                  YOUR MOVE
                </span>

                <h3>
                  How would you
                  <br />
                  fix it?
                </h3>

                <p>
                  The server is overloaded. Choose what you
                  would change first.
                </p>

                <div className="solve-options">
                  <div className="solve-option solve-option-load">
                    <div className="solve-option-icon">
                      <GitFork
                        size={18}
                        strokeWidth={1.6}
                      />
                    </div>

                    <div>
                      <strong>
                        Spread traffic
                      </strong>

                      <span>
                        Don't send every request to one server.
                      </span>
                    </div>
                  </div>

                  <div className="solve-option solve-option-cache">
                    <div className="solve-option-icon">
                      <Layers3
                        size={18}
                        strokeWidth={1.6}
                      />
                    </div>

                    <div>
                      <strong>
                        Remember common data
                      </strong>

                      <span>
                        Avoid repeating expensive work.
                      </span>
                    </div>
                  </div>

                  <div className="solve-option solve-option-data">
                    <div className="solve-option-icon">
                      <Database
                        size={18}
                        strokeWidth={1.6}
                      />
                    </div>

                    <div>
                      <strong>
                        Store information differently
                      </strong>

                      <span>
                        Change how application data is stored.
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* =============================================
                  03 SOLVE — CONCEPT REVEAL
              ============================================= */}

              <div className="solve-concept-card">
                <span className="solve-concept-eyebrow">
                  YOU CHOSE
                </span>

                <strong>
                  Spread traffic
                </strong>

                <p>
                  Instead of making one server do everything,
                  distribute requests across several servers.
                </p>

                <div className="solve-term">
                  <GitFork
                    size={17}
                    strokeWidth={1.7}
                  />

                  <div>
                    <span>
                      THIS IS CALLED A
                    </span>

                    <strong>
                      Load Balancer
                    </strong>
                  </div>
                </div>
              </div>

              {/* =============================================
                  SOLVED ARCHITECTURE
              ============================================= */}

              <div className="solve-architecture">
                <div className="solve-line solve-line-user-lb" />

                <div className="solve-load-balancer">
                  <StoryNode
                    type="TRAFFIC"
                    name="Load Balancer"
                    icon={
                      <GitFork
                        size={21}
                        strokeWidth={1.7}
                      />
                    }
                  />
                </div>

                <svg
                  className="solve-routing-lines"
                  viewBox="0 0 520 150"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    className="solve-route route-left"
                    d="M260 0 C260 55 90 45 90 150"
                  />

                  <path
                    className="solve-route route-center"
                    d="M260 0 V150"
                  />

                  <path
                    className="solve-route route-right"
                    d="M260 0 C260 55 430 45 430 150"
                  />
                </svg>

                <div className="solve-server solve-server-one">
                  <StoryNode
                    type="COMPUTE"
                    name="Server 1"
                    icon={
                      <Server
                        size={19}
                        strokeWidth={1.7}
                      />
                    }
                  />
                </div>

                <div className="solve-server solve-server-two">
                  <StoryNode
                    type="COMPUTE"
                    name="Server 2"
                    icon={
                      <Server
                        size={19}
                        strokeWidth={1.7}
                      />
                    }
                  />
                </div>

                <div className="solve-server solve-server-three">
                  <StoryNode
                    type="COMPUTE"
                    name="Server 3"
                    icon={
                      <Server
                        size={19}
                        strokeWidth={1.7}
                      />
                    }
                  />
                </div>

                <span className="solve-request solve-request-one" />
                <span className="solve-request solve-request-two" />
                <span className="solve-request solve-request-three" />
              </div>

              {/* =============================================
                  03 SOLVE — SUCCESS
              ============================================= */}

              <div className="solve-success">
                <span className="solve-success-eyebrow">
                  SYSTEM RECOVERED
                </span>

                <strong>
                  You made Instagram
                  <br />
                  more scalable.
                </strong>

                <p>
                  More traffic can now be handled without
                  relying on one server.
                </p>
              </div>

              {/* =============================================
                  04 LEARN
              ============================================= */}

              {/* =============================================
                  05 CHALLENGE — INSTAGRAM
                  Reuses the solved architecture above; only a
                  compact identifier is added to the canvas.
              ============================================= */}

              <div className="challenge-canvas-tag">
                <span>CHALLENGE</span>
                <strong>Instagram · Scaling</strong>
              </div>

              {/* Added by the challenge drag; hidden until dropped */}

              <span className="challenge-cache-link" />

              <div className="challenge-cache">
                <StoryNode
                  type="MEMORY"
                  name="Cache"
                  icon={
                    <Layers3
                      size={21}
                      strokeWidth={1.7}
                    />
                  }
                />
              </div>
            </div>

            {/* ===============================================
                FINAL DEMO — REPOSITORY IMPORT LAYER
                Separate from the build area so the Instagram
                exercise can fade out as one unit.
            =============================================== */}

            <div className="repo-demo-layer">
              <div className="repo-demo-import">
                <span className="repo-demo-kicker">
                  IMPORT REPOSITORY
                </span>

                <strong className="repo-demo-title">
                  Map your architecture
                </strong>

                <div className="repo-demo-input-row">
                  <div className="repo-demo-field">
                    <GitHubMark />

                    <span className="repo-demo-field-value">
                      <span className="repo-demo-placeholder">
                        GitHub repository URL
                      </span>

                      <span className="repo-demo-url">
                        {REPO_DEMO_URL}
                      </span>
                    </span>
                  </div>

                  <button
                    className="repo-demo-import-button"
                    type="button"
                  >
                    Import
                  </button>
                </div>
              </div>

              <div className="repo-demo-analysis">
                <span className="repo-demo-kicker">
                  ANALYZING REPOSITORY
                </span>

                <strong className="repo-demo-analysis-repo">
                  jieCheong/studycast
                </strong>

                <span className="repo-demo-progress">
                  <span className="repo-demo-progress-fill" />
                </span>

                <ul className="repo-demo-findings">
                  {REPO_DEMO_FINDINGS.map((finding) => (
                    <li
                      key={finding}
                      className="repo-demo-finding"
                    >
                      <Check
                        size={10}
                        strokeWidth={2}
                      />

                      <span>{finding}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="repo-demo-architecture">
                <svg
                  className="repo-demo-lines"
                  viewBox="0 0 560 538"
                  aria-hidden="true"
                >
                  {REPO_DEMO_LINES.map((line) => (
                    <path
                      key={line.id}
                      className={`repo-demo-line repo-demo-line-${line.id}`}
                      d={line.d}
                      pathLength={1}
                    />
                  ))}
                </svg>

                {REPO_DEMO_COMPONENTS.map((component) => (
                  <div
                    key={component.id}
                    className={`repo-demo-node repo-demo-node-${component.id}`}
                  >
                    <StoryNode
                      type={component.type}
                      name={component.name}
                      icon={component.icon}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* =================================================
              BOTTOM CONTROLS
          ================================================= */}

          <div className="learn-bottom-controls">
            <div className="learn-mode-control">
              <span className="learn-mode-dot" />
              <span>LEARN MODE</span>
            </div>

            <button
              className="learn-run-button"
              type="button"
            >
              <Play
                size={11}
                fill="currentColor"
                strokeWidth={1.5}
              />

              <span className="learn-run-label">
                Run system
              </span>
            </button>

            {/* Final demo CTA; replaces Run system at the end */}

            <div className="repo-demo-cta">
              <span>Map your own architecture.</span>

              <button
                className="repo-demo-cta-button"
                type="button"
              >
                Get started

                <ArrowRight
                  size={11}
                  strokeWidth={1.8}
                />
              </button>
            </div>
          </div>
        </main>

        {/* ===================================================
            RIGHT — SYSTEM INSPECTOR
        =================================================== */}

        <aside className="learn-inspector">
          <div className="learn-inspector-tabs">
            <button
              className="learn-inspector-tab active"
              type="button"
            >
              System
            </button>

            <button
              className="learn-inspector-tab"
              type="button"
            >
              Guide
            </button>
          </div>

          {/* =================================================
              SYSTEM HEALTH
          ================================================= */}

          <div className="learn-score-section">
            <div className="learn-panel-kicker">
              SYSTEM HEALTH
            </div>

            <div className="learn-total-score">
              <strong className="inspector-health-value">
                92
              </strong>

              <span>/100</span>
            </div>

            <div className="learn-health-status">
              <span />

              <span className="inspector-health-label">
                HEALTHY
              </span>
            </div>

            <div className="learn-score-list">
              <div className="learn-score-row">
                <div>
                  <span>Scalability</span>
                  <strong>94</strong>
                </div>

                <div className="learn-score-track">
                  <span
                    className="learn-score-fill"
                    style={{ width: "94%" }}
                  />
                </div>
              </div>

              <div className="learn-score-row">
                <div>
                  <span>Reliability</span>
                  <strong>91</strong>
                </div>

                <div className="learn-score-track">
                  <span
                    className="learn-score-fill"
                    style={{ width: "91%" }}
                  />
                </div>
              </div>

              <div className="learn-score-row">
                <div>
                  <span>Speed</span>
                  <strong>88</strong>
                </div>

                <div className="learn-score-track">
                  <span
                    className="learn-score-fill"
                    style={{ width: "88%" }}
                  />
                </div>
              </div>

              <div className="learn-score-row">
                <div>
                  <span>Cost efficiency</span>
                  <strong>83</strong>
                </div>

                <div className="learn-score-track">
                  <span
                    className="learn-score-fill"
                    style={{ width: "83%" }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* =================================================
              GUIDE — DEFAULT BUILD MESSAGE
          ================================================= */}

          <div className="inspector-guide inspector-guide-build">
            <div className="learn-guide-heading">
              <div className="learn-guide-icon">
                <Bot
                  size={15}
                  strokeWidth={1.6}
                />
              </div>

              <div>
                <span>ARCHITECH GUIDE</span>
                <strong>Build the basics</strong>
              </div>
            </div>

            <div className="learn-guide-component">
              <UserRound
                size={14}
                strokeWidth={1.6}
              />

              <strong>Start with the request</strong>
            </div>

            <p>
              Every system starts with someone asking it to
              do something. We'll build only what Instagram
              needs as the problem grows.
            </p>
          </div>

          {/* =================================================
              GUIDE — SERVER
          ================================================= */}

          <div className="inspector-guide inspector-guide-server">
            <div className="learn-guide-heading">
              <div className="learn-guide-icon">
                <Server
                  size={15}
                  strokeWidth={1.6}
                />
              </div>

              <div>
                <span>ARCHITECH GUIDE</span>
                <strong>Handle the request</strong>
              </div>
            </div>

            <div className="learn-guide-component">
              <Server
                size={14}
                strokeWidth={1.6}
              />

              <strong>Server</strong>
            </div>

            <p>
              The server receives the user's request and
              decides what the application should do next.
            </p>
          </div>

          {/* =================================================
              GUIDE — DATABASE
          ================================================= */}

          <div className="inspector-guide inspector-guide-database">
            <div className="learn-guide-heading">
              <div className="learn-guide-icon">
                <Database
                  size={15}
                  strokeWidth={1.6}
                />
              </div>

              <div>
                <span>ARCHITECH GUIDE</span>
                <strong>Remember the data</strong>
              </div>
            </div>

            <div className="inspector-guide inspector-guide-built">
  <div className="learn-guide-heading">
    <div className="learn-guide-icon">
      <Layers3
        size={15}
        strokeWidth={1.6}
      />
    </div>

    <div>
      <span>ARCHITECH GUIDE</span>
      <strong>Your first system</strong>
    </div>
  </div>

  <div className="learn-guide-component">
    <Activity
      size={14}
      strokeWidth={1.6}
    />

    <strong>User → Server → Database</strong>
  </div>

  <p>
    A user makes a request. The server processes it.
    The database stores the information that needs to persist.
  </p>

  <div className="build-complete-flow">
    <span>User</span>
    <i>→</i>
    <span>Server</span>
    <i>→</i>
    <span>Database</span>
  </div>
</div>

            <div className="learn-guide-component">
              <Database
                size={14}
                strokeWidth={1.6}
              />

              <strong>Database</strong>
            </div>

            <p>
              Posts, users, comments, and likes need
              persistent storage so they still exist after
              each request finishes.
            </p>
          </div>

          {/* =================================================
              GUIDE — BREAK
          ================================================= */}

          <div className="inspector-guide inspector-guide-break">
            <div className="learn-guide-heading">
              <div className="learn-guide-icon">
                <Activity
                  size={15}
                  strokeWidth={1.6}
                />
              </div>

              <div>
                <span>ARCHITECH GUIDE</span>
                <strong>Watch the bottleneck</strong>
              </div>
            </div>

            <div className="learn-guide-component">
              <Activity
                size={14}
                strokeWidth={1.6}
              />

              <strong>Traffic overload</strong>
            </div>

            <p>
              As traffic increases, every request still
              depends on one server. That server becomes the
              bottleneck.
            </p>
          </div>

          {/* =================================================
              GUIDE — SOLVE
          ================================================= */}

          <div className="inspector-guide inspector-guide-solve">
            <div className="learn-guide-heading">
              <div className="learn-guide-icon">
                <GitFork
                  size={15}
                  strokeWidth={1.6}
                />
              </div>

              <div>
                <span>ARCHITECH GUIDE</span>
                <strong>Remove the bottleneck</strong>
              </div>
            </div>

            <div className="learn-guide-component">
              <GitFork
                size={14}
                strokeWidth={1.6}
              />

              <strong>Spread traffic</strong>
            </div>

            <p>
              Instead of forcing one server to handle every
              request, distribute traffic across multiple
              servers.
            </p>
          </div>

          {/* =================================================
              GUIDE — LEARN
          ================================================= */}

          <div className="inspector-guide inspector-guide-learn">
            <div className="learn-guide-heading">
              <div className="learn-guide-icon">
                <Bot
                  size={15}
                  strokeWidth={1.6}
                />
              </div>

              <div>
                <span>ARCHITECH GUIDE</span>
                <strong>Why this works</strong>
              </div>
            </div>

            <div className="learn-guide-component">
              <GitFork
                size={14}
                strokeWidth={1.6}
              />

              <strong>Load Balancer</strong>
            </div>

            <p>
              Requests are distributed across multiple
              servers, so no single server has to handle
              everything.
            </p>

            <button
              className="learn-guide-action"
              type="button"
            >
              Explain this component

              <ChevronRight
                size={12}
                strokeWidth={1.7}
              />
            </button>
          </div>

          {/* =================================================
              GUIDE — CHALLENGE
          ================================================= */}

          <div className="inspector-guide inspector-guide-challenge">
            <div className="learn-guide-heading">
              <div className="learn-guide-icon">
                <Activity
                  size={15}
                  strokeWidth={1.6}
                />
              </div>

              <div>
                <span>CHALLENGE MODE</span>
                <strong>Instagram</strong>
                <em>Scaling Challenge</em>
              </div>
            </div>

            <div className="challenge-spec-section">
              <span className="challenge-spec-label">
                REQUIREMENTS
              </span>

              <dl className="challenge-spec-list">
                {CHALLENGE_REQUIREMENTS.map((requirement) => (
                  <div key={requirement.label}>
                    <dt>{requirement.label}</dt>
                    <dd>{requirement.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="challenge-spec-section">
              <span className="challenge-spec-label">TASK</span>

              <p className="challenge-spec-task">
                Modify the architecture to satisfy the
                requirements.
              </p>
            </div>
          </div>

          {/* =================================================
              GUIDE — CHALLENGE RESULT
          ================================================= */}

          <div className="inspector-guide inspector-guide-challenge-result">
            <div className="learn-guide-heading">
              <div className="learn-guide-icon">
                <Check
                  size={15}
                  strokeWidth={1.8}
                />
              </div>

              <div>
                <span>CHALLENGE RESULT</span>
                <strong>Requirements met</strong>
                <em>Instagram · Scaling Challenge</em>
              </div>
            </div>

            <div className="challenge-spec-section">
              <span className="challenge-spec-label">LATENCY</span>

              <dl className="challenge-spec-list">
                {CHALLENGE_RESULT_ROWS.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {/* =================================================
              GUIDE — IMPORTED PROJECT OVERVIEW
          ================================================= */}

          <div className="inspector-guide inspector-guide-repo">
            <div className="learn-guide-heading">
              <div className="learn-guide-icon">
                <GitFork
                  size={15}
                  strokeWidth={1.6}
                />
              </div>

              <div>
                <span>SYSTEM OVERVIEW</span>
                <strong>StudyCast</strong>
                <em>
                  {REPO_DEMO_COMPONENTS.length} components
                  detected
                </em>
              </div>
            </div>

            <div className="challenge-spec-section">
              <span className="challenge-spec-label">
                COMPONENTS
              </span>

              <dl className="challenge-spec-list repo-demo-component-list">
                {REPO_DEMO_COMPONENTS.map((component) => (
                  <div key={component.id}>
                    <dt>{component.name}</dt>
                    <dd>{component.type}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="repo-demo-mapped">
              <Check
                size={11}
                strokeWidth={2}
              />

              <span>Architecture mapped</span>
            </div>
          </div>
        </aside>

        {/* ===================================================
            DEMO CURSOR
            Single shared cursor. The layer stays hidden until
            05 CHALLENGE, so 01 BUILD renders unchanged.
        =================================================== */}

        <div
          className="challenge-cursor-layer"
          aria-hidden="true"
        >
          <div className="story-drag-ghost story-drag-ghost-cache">
            <div className="story-drag-ghost-icon">
              <Layers3
                size={15}
                strokeWidth={1.7}
              />
            </div>

            <div className="story-drag-ghost-copy">
              <strong>Cache</strong>
              <span>In-memory store</span>
            </div>
          </div>

          <div className="story-demo-cursor">
            <svg
              className="story-demo-cursor-icon"
              viewBox="0 0 20 24"
            >
              <path
                d="M2 2 L2 19 L6.5 14.8 L9.6 21.6 L12.4 20.4 L9.3 13.7 L15.6 13.7 Z"
                fill="#0a0a0a"
                stroke="#ffffff"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>

            <span className="story-demo-cursor-label">DRAG</span>
          </div>
        </div>
      </div>
    </div>
  );
}