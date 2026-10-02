import type { ReactNode } from "react";

import {
  Activity,
  Database,
  GitFork,
  Layers3,
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
      <div className="story-node-icon">
        {icon}
      </div>

      <div className="story-node-copy">
        <span>{type}</span>
        <strong>{name}</strong>
      </div>

      <span className="story-node-status" />
    </div>
  );
}

export default function SystemCanvas() {
  return (
    <div className="story-demo">
      {/* =====================================
          STORY PROGRESS
      ====================================== */}

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

        <span>04 LEARN</span>
        <span>05 CHALLENGE</span>
      </div>

      {/* =====================================
          ARCHITECT CANVAS
      ====================================== */}

      <div className="story-demo-canvas">
        {/* HEADER */}

        <div className="story-canvas-header">
          <div>
            <span className="story-canvas-eyebrow">
              PROJECT
            </span>

            <strong>Instagram</strong>
          </div>

          <div className="story-canvas-status">
            <span />

            <span className="canvas-status-text">
              LIVE SYSTEM
            </span>
          </div>
        </div>

        <div className="story-build-area">
          {/* ===================================
              USER
          ==================================== */}

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

          {/* ===================================
              USER → ORIGINAL SERVER
          ==================================== */}

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

          {/* ===================================
              SERVER LESSON
          ==================================== */}

          <div className="story-teaching-prompt prompt-server">
            <span className="story-prompt-number">
              01
            </span>

            <div>
              <strong>
                Who handles the request?
              </strong>

              <p>
                Something needs to receive what the user
                sends and decide what happens next.
              </p>

              <span className="story-concept">
                Server
              </span>
            </div>
          </div>

          {/* ===================================
              ORIGINAL SERVER
          ==================================== */}

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

          {/* ===================================
              SERVER → DATABASE
          ==================================== */}

          <div className="story-connector connector-server-db">
            <span className="story-connector-line" />

            <span className="story-connector-arrow">
              ↓
            </span>

            <span className="traffic-dot traffic-dot-two" />
          </div>

          {/* ===================================
              DATABASE LESSON
          ==================================== */}

          <div className="story-teaching-prompt prompt-database">
            <span className="story-prompt-number">
              02
            </span>

            <div>
              <strong>
                Where do the posts live?
              </strong>

              <p>
                Instagram needs somewhere to remember
                users, posts, comments, and likes.
              </p>

              <span className="story-concept">
                Database
              </span>
            </div>
          </div>

          {/* ===================================
              DATABASE
          ==================================== */}

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

          {/* ===================================
              BREAK — TRAFFIC
          ==================================== */}

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

          {/* ===================================
              BREAK — HEALTH
          ==================================== */}

          <div className="break-health-panel">
            <div className="break-health-title">
              <Activity
                size={15}
                strokeWidth={1.7}
              />

              <span>SYSTEM HEALTH</span>
            </div>

            <strong className="health-value">
              92
            </strong>

            <span className="health-label">
              HEALTHY
            </span>

            <div className="health-meter">
              <span className="health-meter-fill" />
            </div>
          </div>

          {/* ===================================
              BREAK RESULT
          ==================================== */}

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

          {/* ===================================
              03 SOLVE — QUESTION
          ==================================== */}

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
                  <strong>Spread traffic</strong>
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
                  <strong>Remember common data</strong>
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
                  <strong>Store information differently</strong>
                  <span>
                    Change how application data is stored.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ===================================
              SOLVE — CONCEPT REVEAL
          ==================================== */}

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
                <span>THIS IS CALLED A</span>
                <strong>Load Balancer</strong>
              </div>
            </div>
          </div>

          {/* ===================================
              SOLVED ARCHITECTURE
          ==================================== */}

          <div className="solve-architecture">
            {/* USER → LOAD BALANCER */}

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

            {/* FAN OUT */}

            <svg
              className="solve-routing-lines"
              viewBox="0 0 520 150"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path className="solve-route route-left" d="M260 0 C260 55 90 45 90 150" />
              <path className="solve-route route-center" d="M260 0 V150" />
              <path className="solve-route route-right" d="M260 0 C260 55 430 45 430 150" />
            </svg>

            {/* THREE SERVERS */}

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

            {/* REQUEST LIGHTS */}

            <span className="solve-request solve-request-one" />
            <span className="solve-request solve-request-two" />
            <span className="solve-request solve-request-three" />
          </div>

          {/* ===================================
              SOLVE SUCCESS
          ==================================== */}

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
        </div>

        {/* ===================================
            FOOTER
        ==================================== */}

        <div className="story-canvas-footer">
          <div>
            <span>COMPONENTS</span>

            <strong className="component-count">
              3
            </strong>
          </div>

          <div className="story-build-complete">
            <span />
            BASIC SYSTEM
          </div>
        </div>
      </div>
    </div>
  );
}