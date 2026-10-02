import type { ReactNode } from "react";

import {
  Database,
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
        <span className="active">
          01 BUILD
        </span>

        <span>02 BREAK</span>
        <span>03 SOLVE</span>
        <span>04 LEARN</span>
        <span>05 CHALLENGE</span>
      </div>


      {/* =====================================
          ARCHITECT CANVAS
      ====================================== */}

      <div className="story-demo-canvas">

        {/* CANVAS HEADER */}

        <div className="story-canvas-header">
          <div>
            <span className="story-canvas-eyebrow">
              PROJECT
            </span>

            <strong>
              Instagram
            </strong>
          </div>

          <div className="story-canvas-status">
            <span />
            LIVE SYSTEM
          </div>
        </div>


        {/* ===================================
            BUILD AREA
        ==================================== */}

        <div className="story-build-area">

          {/* USER */}

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


          {/* USER → SERVER */}

          <div className="story-connector connector-user-server">

            <span className="story-connector-line" />

            <span className="story-connector-arrow">
              ↓
            </span>

            <span className="traffic-dot traffic-dot-one" />

          </div>


          {/* SERVER LESSON */}

          <div className="story-teaching-prompt prompt-server">

            <span className="story-prompt-number">
              01
            </span>

            <div>
              <strong>
                Who handles the request?
              </strong>

              <p>
                Something needs to receive what the
                user sends and decide what happens next.
              </p>

              <span className="story-concept">
                Server
              </span>
            </div>

          </div>


          {/* SERVER */}

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
          </div>


          {/* SERVER → DATABASE */}

          <div className="story-connector connector-server-db">

            <span className="story-connector-line" />

            <span className="story-connector-arrow">
              ↓
            </span>

            <span className="traffic-dot traffic-dot-two" />

          </div>


          {/* DATABASE LESSON */}

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


          {/* DATABASE */}

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

        </div>


        {/* ===================================
            CANVAS FOOTER
        ==================================== */}

        <div className="story-canvas-footer">

          <div>
            <span>COMPONENTS</span>
            <strong>3</strong>
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