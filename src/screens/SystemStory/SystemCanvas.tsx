import type { ReactNode } from "react";

import {
  Activity,
  Bot,
  Box,
  ChevronRight,
  Cloud,
  Database,
  GitFork,
  Layers3,
  Play,
  Plus,
  Server,
  UserRound,
} from "lucide-react";

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

      <span className="story-node-status" />
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
      </div>

      {/* =====================================================
          ARCHITECT PRODUCT WORKSPACE

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

            <ToolboxItem
              name="Cache"
              icon={
                <Layers3
                  size={16}
                  strokeWidth={1.6}
                />
              }
            />

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
                  04 LEARN — CANVAS HIGHLIGHT
              ============================================= */}

              <div className="learn-canvas-focus">
                <span>SELECTED COMPONENT</span>

                <strong>Load Balancer</strong>

                <p>
                  See why this component changed the system.
                </p>
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

              Run system
            </button>
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
                <span>ARCHITECT GUIDE</span>
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
                <span>ARCHITECT GUIDE</span>
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
                <span>ARCHITECT GUIDE</span>
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
      <span>ARCHITECT GUIDE</span>
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
                <span>ARCHITECT GUIDE</span>
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
                <span>ARCHITECT GUIDE</span>
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
                <span>ARCHITECT GUIDE</span>
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
        </aside>
      </div>
    </div>
  );
}