import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

import "./SystemStory.css";
import SystemCanvas from "./SystemCanvas";

gsap.registerPlugin(ScrollTrigger);

const NORMAL_NODE_SHADOW =
  "0 1px 2px rgba(10, 10, 10, 0.04), 0 8px 24px rgba(10, 10, 10, 0.04)";

const ACTIVE_NODE_SHADOW =
  "0 0 0 3px #ffffff, 0 0 0 5px rgba(10, 10, 10, 0.12), 0 12px 32px rgba(10, 10, 10, 0.12)";

const OVERLOADED_NODE_SHADOW =
  "0 0 0 3px #ffffff, 0 0 0 6px rgba(10, 10, 10, 0.18), 0 18px 42px rgba(10, 10, 10, 0.16)";

export default function SystemStory({
  onGetStarted,
}: {
  onGetStarted: () => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const demoRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!demoRef.current) return;

      /* =====================================================
         CURSOR POSITION HELPER
      ===================================================== */

      const getCursorPoint = (
  selector: string,
  xRatio = 0.5,
  yRatio = 0.5
) => {
  const cursor =
    sectionRef.current?.querySelector(
      ".story-demo-cursor"
    ) as HTMLElement | null;

  const target =
    sectionRef.current?.querySelector(
      selector
    ) as HTMLElement | null;

  if (!cursor || !target) {
    return { x: 0, y: 0 };
  }

  const targetRect = target.getBoundingClientRect();

  /*
   * IMPORTANT:
   * GSAP x/y move the cursor from its CSS layout origin.
   *
   * offsetLeft / offsetTop give us that stable layout origin
   * inside the cursor's positioned parent without including
   * GSAP's current transform.
   */
  const originX = cursor.offsetLeft;
  const originY = cursor.offsetTop;

  /*
   * targetRect is viewport-based, so convert the target
   * into the cursor parent's coordinate system.
   */
  const parent =
    cursor.offsetParent as HTMLElement | null;

  if (!parent) {
    return { x: 0, y: 0 };
  }

  const parentRect = parent.getBoundingClientRect();

  const targetX =
    targetRect.left -
    parentRect.left +
    targetRect.width * xRatio;

  const targetY =
    targetRect.top -
    parentRect.top +
    targetRect.height * yRatio;

  return {
    x: targetX - originX,
    y: targetY - originY,
  };
};

      const getElementPoint = (
  movingSelector: string,
  targetSelector: string,
  xRatio = 0.5,
  yRatio = 0.5
) => {
  const moving =
    sectionRef.current?.querySelector(
      movingSelector
    ) as HTMLElement | null;

  const target =
    sectionRef.current?.querySelector(
      targetSelector
    ) as HTMLElement | null;

  if (!moving || !target) {
    return { x: 0, y: 0 };
  }

  const movingRect = moving.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  const currentX =
    Number(gsap.getProperty(moving, "x")) || 0;

  const currentY =
    Number(gsap.getProperty(moving, "y")) || 0;

  // Recover this element's OWN x:0 / y:0 position.
  const originX = movingRect.left - currentX;
  const originY = movingRect.top - currentY;

  return {
    x:
      targetRect.left +
      targetRect.width * xRatio -
      originX,

    y:
      targetRect.top +
      targetRect.height * yRatio -
      originY,
  };
};
      /* =====================================================
         STORY PROGRESS INDICATOR
         One underline. Its position is derived from a scrubbed
         index (0 = BUILD … 4 = CHALLENGE) and the live label
         geometry, so it follows the scroll in both directions
         and stays aligned after resizes.
      ===================================================== */

      const PROGRESS_STEPS = [
        ".progress-build",
        ".progress-break",
        ".progress-solve",
        ".progress-learn",
        ".progress-challenge",
      ];

      const progressState = { index: 0 };

      const getProgressBox = (selector: string) => {
        const label =
          sectionRef.current?.querySelector(
            selector
          ) as HTMLElement | null;

        return label
          ? { x: label.offsetLeft, width: label.offsetWidth }
          : { x: 0, width: 0 };
      };

      const renderProgressIndicator = () => {
        const indicator =
          sectionRef.current?.querySelector(
            ".story-progress-indicator"
          ) as HTMLElement | null;

        if (!indicator) return;

        const last = PROGRESS_STEPS.length - 1;
        const index = gsap.utils.clamp(0, last, progressState.index);
        const fromStep = Math.floor(index);
        const toStep = Math.min(fromStep + 1, last);
        const progress = index - fromStep;

        const from = getProgressBox(PROGRESS_STEPS[fromStep]);
        const to = getProgressBox(PROGRESS_STEPS[toStep]);

        gsap.set(indicator, {
          x: gsap.utils.interpolate(from.x, to.x, progress),
          width: gsap.utils.interpolate(
            from.width,
            to.width,
            progress
          ),
        });
      };

      renderProgressIndicator();

      window.addEventListener("resize", renderProgressIndicator);
      document.fonts?.ready.then(renderProgressIndicator);

      /* =====================================================
         INITIAL BUILD STATE
      ===================================================== */

      gsap.set(
        [
          ".story-server",
          ".story-database",
          ".connector-user-server",
          ".connector-server-db",
        ],
        {
          autoAlpha: 0,
        }
      );

      gsap.set(".story-server", {
        y: 16,
        scale: 0.96,
      });

      gsap.set(".story-database", {
        y: 16,
        scale: 0.96,
      });

      gsap.set(
        [
          ".connector-user-server .story-connector-line",
          ".connector-server-db .story-connector-line",
        ],
        {
          scaleY: 0,
          transformOrigin: "top center",
        }
      );

      gsap.set(
        [
          ".connector-user-server .story-connector-arrow",
          ".connector-server-db .story-connector-arrow",
          ".traffic-dot",
        ],
        {
          autoAlpha: 0,
        }
      );

      /* =====================================================
         INITIAL DEMO CURSOR
      ===================================================== */

      gsap.set(".story-demo-cursor", {
        autoAlpha: 0,
        x: 0,
        y: 0,
        scale: 1,
      });

      gsap.set(".story-demo-cursor-label", {
        autoAlpha: 0,
        y: 3,
      });

      gsap.set(
        [
          ".story-drag-ghost-server",
          ".story-drag-ghost-database",
        ],
        {
          autoAlpha: 0,
          x: 0,
          y: 0,
          scale: 0.96,
        }
      );

      /* =====================================================
         INITIAL TOOLBOX
      ===================================================== */

      gsap.set(
        [
          ".toolbox-server .learn-toolbox-item",
          ".toolbox-database .learn-toolbox-item",
        ],
        {
          backgroundColor: "rgba(255, 255, 255, 0)",
          borderColor: "rgba(255, 255, 255, 0)",
        }
      );

      gsap.set(
        [
          ".toolbox-server .learn-toolbox-icon",
          ".toolbox-database .learn-toolbox-icon",
        ],
        {
          scale: 1,
        }
      );

      gsap.set(
        [
          ".toolbox-server .learn-toolbox-plus",
          ".toolbox-database .learn-toolbox-plus",
        ],
        {
          rotation: 0,
          opacity: 0.28,
        }
      );

      /* =====================================================
         INITIAL BREAK STATE
      ===================================================== */

      gsap.set(
        [
          ".break-traffic-panel",
          ".break-result",
          ".server-warning",
          ".break-particle",
        ],
        {
          autoAlpha: 0,
        }
      );

      gsap.set(".break-traffic-panel", {
        y: 12,
      });

      gsap.set(".break-result", {
        y: 18,
      });

      gsap.set(".traffic-scale-fill", {
        scaleX: 0,
        transformOrigin: "left center",
      });

      gsap.set(".traffic-scale-thumb", {
        left: "0%",
      });

      /* =====================================================
         INITIAL SOLVE STATE
      ===================================================== */

      gsap.set(
        [
          ".solve-panel",
          ".solve-concept-card",
          ".solve-architecture",
          ".solve-success",
        ],
        {
          autoAlpha: 0,
        }
      );

      gsap.set(".solve-panel", {
        x: -16,
      });

      gsap.set(".solve-concept-card", {
        x: -16,
      });

      gsap.set(".solve-success", {
        x: -16,
      });

      gsap.set(
        [
          ".solve-load-balancer",
          ".solve-server-one",
          ".solve-server-two",
          ".solve-server-three",
        ],
        {
          autoAlpha: 0,
          scale: 0.94,
        }
      );

      gsap.set(".solve-line-user-lb", {
        scaleY: 0,
        transformOrigin: "top center",
      });

      gsap.set(".solve-route", {
        strokeDasharray: 300,
        strokeDashoffset: 300,
      });

      gsap.set(".solve-request", {
        autoAlpha: 0,
      });

      /* =====================================================
         INITIAL WORKSPACE / INSPECTOR
      ===================================================== */

      gsap.set(".inspector-guide", {
        autoAlpha: 0,
        display: "none",
      });

      gsap.set(".inspector-guide-build", {
        autoAlpha: 1,
        display: "block",
      });


      gsap.set(".learn-focus-copy", {
        autoAlpha: 0,
        y: 6,
      });

      gsap.set(
        [
          ".learn-toolbox",
          ".learn-inspector",
          ".learn-canvas-toolbar",
          ".learn-bottom-controls",
        ],
        {
          autoAlpha: 1,
        }
      );

      gsap.set(".challenge-canvas-tag", {
        autoAlpha: 0,
        y: -4,
      });

      gsap.set(".inspector-guide-challenge", {
        y: 8,
      });

      gsap.set(".inspector-guide-challenge-result", {
        y: 8,
      });

      gsap.set(".challenge-cursor-layer", {
        autoAlpha: 0,
      });

      gsap.set(".story-drag-ghost-cache", {
        autoAlpha: 0,
        x: 0,
        y: 0,
        scale: 0.96,
      });

      gsap.set(".challenge-cache", {
        autoAlpha: 0,
        y: 16,
        scale: 0.96,
      });

      gsap.set(".challenge-cache-link", {
        scaleX: 0,
        transformOrigin: "left center",
      });

      gsap.set(".toolbox-cache .learn-toolbox-item", {
        backgroundColor: "rgba(255, 255, 255, 0)",
        borderColor: "rgba(255, 255, 255, 0)",
      });

      gsap.set(".toolbox-cache .learn-toolbox-plus", {
        rotation: 0,
        opacity: 0.28,
      });

      /* =====================================================
         INITIAL FINAL-DEMO (REPOSITORY IMPORT) STATE
      ===================================================== */

      gsap.set(
        [
          ".repo-demo-import",
          ".repo-demo-analysis",
          ".inspector-guide-repo",
        ],
        {
          autoAlpha: 0,
          y: 8,
        }
      );

      gsap.set([".repo-demo-placeholder"], {
        autoAlpha: 1,
      });

      gsap.set(".repo-demo-url", {
        autoAlpha: 0,
      });

      gsap.set(".repo-demo-finding", {
        autoAlpha: 0,
        x: -4,
      });

      gsap.set(".repo-demo-progress-fill", {
        scaleX: 0,
        transformOrigin: "left center",
      });

      gsap.set(".repo-demo-node", {
        autoAlpha: 0,
        y: 12,
        scale: 0.96,
      });

      gsap.set(".repo-demo-line", {
        strokeDashoffset: 1,
      });

      gsap.set(".repo-demo-cta", {
        autoAlpha: 0,
        x: 6,
      });

      /* =====================================================
         MAIN TIMELINE
      ===================================================== */

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: demoRef.current,
          start: "top 24px",
          end: "+=20700",
          scrub: 0.5,
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
        },
      });

      /* Slides the shared progress underline alongside the
         existing label-opacity transition (same start, same
         duration, so story timing is unchanged). */
      const moveProgressIndicator = (index: number) =>
        timeline.to(
          progressState,
          {
            index,
            duration: 0.25,
            ease: "power2.inOut",
            onUpdate: renderProgressIndicator,
          },
          "<"
        );

      /* =====================================================
         01 BUILD — USER
      ===================================================== */

      timeline.fromTo(
        ".story-user",
        {
          autoAlpha: 0,
          y: -12,
          scale: 0.96,
        },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.7,
          ease: "power2.out",
        }
      );

      timeline.to(".story-user .story-node", {
        borderColor: "rgba(10, 10, 10, 0.5)",
        boxShadow: ACTIVE_NODE_SHADOW,
        duration: 0.35,
      });

      timeline.to(
        ".story-user .story-node-status",
        {
          opacity: 1,
          scale: 1.45,
          duration: 0.3,
        },
        "<"
      );

      timeline.to({}, { duration: 0.25 });

      /* =====================================================
         GUIDE → SERVER
      ===================================================== */

      timeline.to(".inspector-guide-build", {
        autoAlpha: 0,
        duration: 0.25,
      });

      timeline.set(".inspector-guide-build", {
        display: "none",
      });

      timeline.set(".inspector-guide-server", {
        display: "block",
      });

      timeline.to(".inspector-guide-server", {
        autoAlpha: 1,
        duration: 0.35,
      });

      timeline.to(
        ".toolbox-server .learn-toolbox-item",
        {
          backgroundColor: "rgba(255, 255, 255, 0.075)",
          borderColor: "rgba(255, 255, 255, 0.15)",
          duration: 0.35,
        },
        "<"
      );

      timeline.to(
        ".toolbox-server .learn-toolbox-icon",
        {
          scale: 1.08,
          duration: 0.25,
          ease: "power2.out",
        },
        "<"
      );

      timeline.to({}, { duration: 0.25 });

      /* =====================================================
         DEMO CURSOR — DRAG SERVER
      ===================================================== */

      timeline.set(".story-demo-cursor", {
        autoAlpha: 1,
      });

      /*
       * IMPORTANT:
       * Cursor now targets the + button instead of the center
       * of the entire Server toolbox row.
       */
      timeline.to(".story-demo-cursor", {
        x: () =>
          getCursorPoint(
            ".toolbox-server .learn-toolbox-plus",
            0.5,
            0.5
          ).x,

        y: () =>
          getCursorPoint(
            ".toolbox-server .learn-toolbox-plus",
            0.5,
            0.5
          ).y,

        duration: 0.7,
        ease: "power2.inOut",
      });

      /* click */

      timeline.to(".story-demo-cursor", {
        scale: 0.82,
        duration: 0.12,
      });

      timeline.to(
        ".toolbox-server .learn-toolbox-item",
        {
          scale: 0.97,
          duration: 0.12,
        },
        "<"
      );

      timeline.to(".story-demo-cursor-label", {
        autoAlpha: 1,
        y: 0,
        duration: 0.18,
      });

      /* Server ghost appears */

      timeline.set(".story-drag-ghost-server", {
  x: () =>
    getElementPoint(
      ".story-drag-ghost-server",
      ".toolbox-server .learn-toolbox-item",
      0.5,
      0.5
    ).x,

  y: () =>
    getElementPoint(
      ".story-drag-ghost-server",
      ".toolbox-server .learn-toolbox-item",
      0.5,
      0.5
    ).y,
});

      timeline.to(".story-drag-ghost-server", {
        autoAlpha: 0.9,
        scale: 1,
        duration: 0.2,
      });

      timeline.to(
        ".toolbox-server .learn-toolbox-item",
        {
          scale: 1,
          duration: 0.18,
        }
      );

      /* Cursor + ghost move onto canvas */

      timeline.to(".story-demo-cursor", {
  x: () =>
    getCursorPoint(
      ".story-server",
      0.5,
      0.5
    ).x,

  y: () =>
    getCursorPoint(
      ".story-server",
      0.5,
      0.5
    ).y,

  scale: 1,
  duration: 1.15,
  ease: "power2.inOut",
});

      timeline.to(
  ".story-drag-ghost-server",
  {
    x: () =>
      getElementPoint(
        ".story-drag-ghost-server",
        ".story-server",
        0.5,
        0.5
      ).x,

    y: () =>
      getElementPoint(
        ".story-drag-ghost-server",
        ".story-server",
        0.5,
        0.5
      ).y,

    duration: 1.15,
    ease: "power2.inOut",
  },
  "<"
);

      /* Drop */

      timeline.to(".story-demo-cursor", {
        scale: 0.82,
        duration: 0.12,
      });

      timeline.to(
        ".story-drag-ghost-server",
        {
          scale: 0.96,
          duration: 0.12,
        },
        "<"
      );

      timeline.to(".story-drag-ghost-server", {
        autoAlpha: 0,
        duration: 0.18,
      });

      timeline.to(".story-demo-cursor-label", {
        autoAlpha: 0,
        y: 3,
        duration: 0.18,
      });

      timeline.to(".story-demo-cursor", {
        scale: 1,
        duration: 0.15,
      });

      /* =====================================================
         USER → SERVER
      ===================================================== */

      timeline.to(".connector-user-server", {
        autoAlpha: 1,
        duration: 0.1,
      });

      timeline.to(
        ".connector-user-server .story-connector-line",
        {
          scaleY: 1,
          duration: 0.65,
          ease: "power2.inOut",
        }
      );

      timeline.to(
        ".connector-user-server .story-connector-arrow",
        {
          autoAlpha: 1,
          duration: 0.2,
        },
        "-=0.12"
      );

      timeline.to(
        ".story-user .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.12)",
          boxShadow: NORMAL_NODE_SHADOW,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        ".story-user .story-node-status",
        {
          opacity: 0.3,
          scale: 1,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(".story-server", {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.55,
        ease: "back.out(1.5)",
      });

      timeline.to(
        ".story-server .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.5)",
          boxShadow: ACTIVE_NODE_SHADOW,
          duration: 0.35,
        },
        "<"
      );

      timeline.to(
        ".story-server .story-node-status",
        {
          opacity: 1,
          scale: 1.45,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        ".toolbox-server .learn-toolbox-plus",
        {
          rotation: 45,
          opacity: 0.12,
          duration: 0.3,
        },
        "<"
      );

      /* Request travels User → Server */

      timeline.set(
        ".connector-user-server .traffic-dot",
        {
          autoAlpha: 1,
          top: 0,
        }
      );

      timeline.to(
        ".connector-user-server .traffic-dot",
        {
          top: "100%",
          duration: 0.65,
          ease: "none",
        }
      );

      timeline.to(
        ".connector-user-server .traffic-dot",
        {
          autoAlpha: 0,
          duration: 0.12,
        }
      );

      timeline.to({}, { duration: 0.3 });

      /* =====================================================
         GUIDE → DATABASE
      ===================================================== */

      timeline.to(".inspector-guide-server", {
        autoAlpha: 0,
        duration: 0.25,
      });

      timeline.set(".inspector-guide-server", {
        display: "none",
      });

      timeline.set(".inspector-guide-database", {
        display: "block",
      });

      timeline.to(".inspector-guide-database", {
        autoAlpha: 1,
        duration: 0.35,
      });

      timeline.to(
        ".toolbox-database .learn-toolbox-item",
        {
          backgroundColor: "rgba(255, 255, 255, 0.075)",
          borderColor: "rgba(255, 255, 255, 0.15)",
          duration: 0.35,
        },
        "<"
      );

      timeline.to(
        ".toolbox-database .learn-toolbox-icon",
        {
          scale: 1.08,
          duration: 0.25,
          ease: "power2.out",
        },
        "<"
      );

      timeline.to({}, { duration: 0.25 });

      /* =====================================================
         DEMO CURSOR — DRAG DATABASE
      ===================================================== */

      timeline.to(".story-demo-cursor", {
        x: () =>
          getCursorPoint(
            ".toolbox-database .learn-toolbox-plus",
            0.5,
            0.5
          ).x,

        y: () =>
          getCursorPoint(
            ".toolbox-database .learn-toolbox-plus",
            0.5,
            0.5
          ).y,

        duration: 0.85,
        ease: "power2.inOut",
      });

      timeline.to(".story-demo-cursor", {
        scale: 0.82,
        duration: 0.12,
      });

      timeline.to(
        ".toolbox-database .learn-toolbox-item",
        {
          scale: 0.97,
          duration: 0.12,
        },
        "<"
      );

      timeline.to(".story-demo-cursor-label", {
        autoAlpha: 1,
        y: 0,
        duration: 0.18,
      });

      timeline.set(".story-drag-ghost-database", {
  x: () =>
    getElementPoint(
      ".story-drag-ghost-database",
      ".toolbox-database .learn-toolbox-item",
      0.5,
      0.5
    ).x,

  y: () =>
    getElementPoint(
      ".story-drag-ghost-database",
      ".toolbox-database .learn-toolbox-item",
      0.5,
      0.5
    ).y,
});

      timeline.to(".story-drag-ghost-database", {
        autoAlpha: 0.9,
        scale: 1,
        duration: 0.2,
      });

      timeline.to(
        ".toolbox-database .learn-toolbox-item",
        {
          scale: 1,
          duration: 0.18,
        }
      );

      timeline.to(".story-demo-cursor", {
  x: () =>
    getCursorPoint(
      ".story-database",
      0.5,
      0.5
    ).x,

  y: () =>
    getCursorPoint(
      ".story-database",
      0.5,
      0.5
    ).y,

  scale: 1,
  duration: 1.15,
  ease: "power2.inOut",
});

      timeline.to(
  ".story-drag-ghost-database",
  {
    x: () =>
      getElementPoint(
        ".story-drag-ghost-database",
        ".story-database",
        0.5,
        0.5
      ).x,

    y: () =>
      getElementPoint(
        ".story-drag-ghost-database",
        ".story-database",
        0.5,
        0.5
      ).y,

    duration: 1.15,
    ease: "power2.inOut",
  },
  "<"
);

      timeline.to(".story-demo-cursor", {
        scale: 0.82,
        duration: 0.12,
      });

      timeline.to(
        ".story-drag-ghost-database",
        {
          scale: 0.96,
          duration: 0.12,
        },
        "<"
      );

      timeline.to(".story-drag-ghost-database", {
        autoAlpha: 0,
        duration: 0.18,
      });

      timeline.to(".story-demo-cursor-label", {
        autoAlpha: 0,
        y: 3,
        duration: 0.18,
      });

      timeline.to(".story-demo-cursor", {
        scale: 1,
        duration: 0.15,
      });

      /* =====================================================
         SERVER → DATABASE
      ===================================================== */

      timeline.to(".connector-server-db", {
        autoAlpha: 1,
        duration: 0.1,
      });

      timeline.to(
        ".connector-server-db .story-connector-line",
        {
          scaleY: 1,
          duration: 0.65,
          ease: "power2.inOut",
        }
      );

      timeline.to(
        ".connector-server-db .story-connector-arrow",
        {
          autoAlpha: 1,
          duration: 0.2,
        },
        "-=0.12"
      );

      timeline.to(
        ".story-server .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.12)",
          boxShadow: NORMAL_NODE_SHADOW,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        ".story-server .story-node-status",
        {
          opacity: 0.3,
          scale: 1,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(".story-database", {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.55,
        ease: "back.out(1.5)",
      });

      timeline.to(
        ".story-database .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.5)",
          boxShadow: ACTIVE_NODE_SHADOW,
          duration: 0.35,
        },
        "<"
      );

      timeline.to(
        ".story-database .story-node-status",
        {
          opacity: 1,
          scale: 1.45,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        ".toolbox-database .learn-toolbox-plus",
        {
          rotation: 45,
          opacity: 0.12,
          duration: 0.3,
        },
        "<"
      );

      timeline.set(
        ".connector-server-db .traffic-dot",
        {
          autoAlpha: 1,
          top: 0,
        }
      );

      timeline.to(
        ".connector-server-db .traffic-dot",
        {
          top: "100%",
          duration: 0.65,
          ease: "none",
        }
      );

      timeline.to(
        ".connector-server-db .traffic-dot",
        {
          autoAlpha: 0,
          duration: 0.12,
        }
      );

      /* Cursor leaves after teaching drag/drop */

      timeline.to(".story-demo-cursor", {
        x: "+=45",
        y: "+=30",
        autoAlpha: 0,
        duration: 0.45,
        ease: "power2.in",
      });

      timeline.to({}, { duration: 0.35 });

      /* =====================================================
         BUILD COMPLETE
      ===================================================== */

      timeline.to(".inspector-guide-database", {
        autoAlpha: 0,
        duration: 0.25,
      });

      timeline.set(".inspector-guide-database", {
        display: "none",
      });

      timeline.set(".inspector-guide-built", {
        display: "block",
      });

      timeline.to(".inspector-guide-built", {
        autoAlpha: 1,
        duration: 0.35,
      });

      timeline.to(
        [
          ".story-user .story-node",
          ".story-server .story-node",
          ".story-database .story-node",
        ],
        {
          borderColor: "rgba(10, 10, 10, 0.18)",
          boxShadow: NORMAL_NODE_SHADOW,
          duration: 0.35,
        }
      );

      timeline.to(
        [
          ".story-user .story-node-status",
          ".story-server .story-node-status",
          ".story-database .story-node-status",
        ],
        {
          opacity: 0.3,
          scale: 1,
          duration: 0.3,
        },
        "<"
      );

      timeline.to({}, { duration: 1.0 });

      /* =====================================================
         02 BREAK
      ===================================================== */

      timeline.to(".progress-build", {
        opacity: 0.34,
        duration: 0.25,
      });

      timeline.to(
        ".progress-break",
        {
          opacity: 1,
          duration: 0.25,
        },
        "<"
      );

      moveProgressIndicator(1);

      timeline.to(".inspector-guide-built", {
        autoAlpha: 0,
        duration: 0.25,
      });

      timeline.set(".inspector-guide-built", {
        display: "none",
      });

      timeline.set(".inspector-guide-break", {
        display: "block",
      });

      timeline.to(".inspector-guide-break", {
        autoAlpha: 1,
        duration: 0.35,
      });

      timeline.to(".break-traffic-panel", {
        autoAlpha: 1,
        y: 0,
        duration: 0.5,
        ease: "power2.out",
      });

      timeline.to({}, { duration: 0.45 });

      /* 100 → 1K */

      timeline.to(".traffic-value", {
        textContent: "1K",
        duration: 0.1,
      });

      timeline.to(
        ".traffic-scale-fill",
        {
          scaleX: 0.33,
          duration: 0.55,
          ease: "power2.inOut",
        },
        "<"
      );

      timeline.to(
        ".traffic-scale-thumb",
        {
          left: "33%",
          duration: 0.55,
          ease: "power2.inOut",
        },
        "<"
      );

      timeline.to(
        ".break-particle-1",
        {
          autoAlpha: 1,
          duration: 0.25,
        },
        "<"
      );

      timeline.to({}, { duration: 0.3 });

      /* 1K → 10K */

      timeline.to(".traffic-value", {
        textContent: "10K",
        duration: 0.1,
      });

      timeline.to(
        ".traffic-scale-fill",
        {
          scaleX: 0.66,
          duration: 0.55,
          ease: "power2.inOut",
        },
        "<"
      );

      timeline.to(
        ".traffic-scale-thumb",
        {
          left: "66%",
          duration: 0.55,
          ease: "power2.inOut",
        },
        "<"
      );

      timeline.to(
        [".break-particle-2", ".break-particle-3"],
        {
          autoAlpha: 1,
          duration: 0.25,
          stagger: 0.08,
        },
        "<"
      );

      timeline.to(".story-server .story-node", {
        borderColor: "rgba(10, 10, 10, 0.45)",
        boxShadow: ACTIVE_NODE_SHADOW,
        duration: 0.35,
      });

      timeline.to(
        ".inspector-health-value",
        {
          textContent: "68",
          duration: 0.25,
        },
        "<"
      );

      timeline.to(
        ".inspector-health-label",
        {
          textContent: "STRAINED",
          duration: 0.25,
        },
        "<"
      );

      timeline.to({}, { duration: 0.4 });

      /* 10K → 100K */

      timeline.to(".traffic-value", {
        textContent: "100K",
        duration: 0.1,
      });

      timeline.to(
        ".traffic-scale-fill",
        {
          scaleX: 1,
          duration: 0.65,
          ease: "power2.inOut",
        },
        "<"
      );

      timeline.to(
        ".traffic-scale-thumb",
        {
          left: "100%",
          duration: 0.65,
          ease: "power2.inOut",
        },
        "<"
      );

      timeline.to(
        [
          ".break-particle-4",
          ".break-particle-5",
          ".break-particle-6",
        ],
        {
          autoAlpha: 1,
          duration: 0.25,
          stagger: 0.06,
        },
        "<"
      );

      timeline.to(".story-server .story-node", {
        borderColor: "rgba(10, 10, 10, 0.8)",
        boxShadow: OVERLOADED_NODE_SHADOW,
        duration: 0.4,
      });

      timeline.to(
        ".story-server .story-node-status",
        {
          opacity: 1,
          scale: 1.7,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        ".server-warning",
        {
          autoAlpha: 1,
          scale: 1,
          duration: 0.35,
          ease: "back.out(1.8)",
        },
        "<"
      );

      timeline.to(
        ".inspector-health-value",
        {
          textContent: "38",
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        ".inspector-health-label",
        {
          textContent: "OVERLOADED",
          duration: 0.3,
        },
        "<"
      );

      timeline.to({}, { duration: 0.45 });

      timeline.to(".break-result", {
        autoAlpha: 1,
        y: 0,
        duration: 0.5,
        ease: "power2.out",
      });

      timeline.to({}, { duration: 0.9 });

      /* =====================================================
         03 SOLVE
      ===================================================== */

      timeline.to(".progress-break", {
        opacity: 0.34,
        duration: 0.25,
      });

      timeline.to(
        ".progress-solve",
        {
          opacity: 1,
          duration: 0.25,
        },
        "<"
      );

      moveProgressIndicator(2);

      timeline.to(".inspector-guide-break", {
        autoAlpha: 0,
        duration: 0.25,
      });

      timeline.set(".inspector-guide-break", {
        display: "none",
      });

      timeline.set(".inspector-guide-solve", {
        display: "block",
      });

      timeline.to(".inspector-guide-solve", {
        autoAlpha: 1,
        duration: 0.35,
      });

      timeline.to(".break-result", {
        autoAlpha: 0,
        y: 10,
        duration: 0.3,
      });

      timeline.to(".solve-panel", {
        autoAlpha: 1,
        x: 0,
        duration: 0.5,
        ease: "power2.out",
      });

      timeline.to({}, { duration: 0.8 });

      /* Select Spread traffic */

      /* =====================================================
   USER CHOOSES — SPREAD TRAFFIC
===================================================== */

/* Bring the demo cursor back */

timeline.set(".story-demo-cursor", {
  autoAlpha: 1,
  scale: 1,
});

/* Move cursor onto "Spread traffic" */

timeline.to(".story-demo-cursor", {
  x: () =>
    getCursorPoint(
      ".solve-option-load-balancer",
      0.72,
      0.5
    ).x,

  y: () =>
    getCursorPoint(
      ".solve-option-load-balancer",
      0.72,
      0.5
    ).y,

  duration: 0.8,
  ease: "power2.inOut",
});

/* Hover feedback */

timeline.to(
  ".solve-option-load-balancer",
  {
    borderColor: "rgba(10, 10, 10, 0.45)",
    boxShadow:
      "0 8px 24px rgba(10, 10, 10, 0.08)",
    duration: 0.2,
  },
  "-=0.2"
);

/* CLICK */

timeline.to(".story-demo-cursor", {
  scale: 0.82,
  duration: 0.12,
});

timeline.to(
  ".solve-option-load-balancer",
  {
    scale: 0.98,
    duration: 0.12,
  },
  "<"
);

/* Release click */

timeline.to(".story-demo-cursor", {
  scale: 1,
  duration: 0.14,
});

timeline.to(
  ".solve-option-load-balancer",
  {
    scale: 1,
    duration: 0.14,
  },
  "<"
);

/* Selected state */

timeline.to(".solve-option-load-balancer", {
  borderColor: "rgba(10, 10, 10, 0.8)",
  boxShadow:
    "0 0 0 3px #ffffff, 0 0 0 5px rgba(10, 10, 10, 0.12)",
  duration: 0.3,
});

/* Brief pause so the decision is readable */

timeline.to({}, { duration: 0.45 });

/* Cursor leaves */

timeline.to(".story-demo-cursor", {
  x: "+=35",
  y: "+=20",
  autoAlpha: 0,
  duration: 0.35,
  ease: "power2.in",
});

/* Choice panel leaves */

timeline.to(
  ".solve-panel",
  {
    autoAlpha: 0,
    x: -12,
    duration: 0.35,
  },
  "-=0.1"
);

      timeline.to(".solve-concept-card", {
        autoAlpha: 1,
        x: 0,
        duration: 0.45,
        ease: "power2.out",
      });

      timeline.to({}, { duration: 0.75 });

      /* Hide original overloaded path */

      timeline.to(
        [
          ".story-server",
          ".connector-user-server",
          ".connector-server-db",
        ],
        {
          autoAlpha: 0,
          duration: 0.4,
        }
      );

      timeline.to(".solve-architecture", {
        autoAlpha: 1,
        duration: 0.2,
      });

      /* User → Load Balancer */

      timeline.to(".solve-line-user-lb", {
        scaleY: 1,
        duration: 0.55,
        ease: "power2.inOut",
      });

      timeline.to(".solve-load-balancer", {
        autoAlpha: 1,
        scale: 1,
        duration: 0.45,
        ease: "back.out(1.5)",
      });

      timeline.to(
        ".solve-load-balancer .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.65)",
          boxShadow: ACTIVE_NODE_SHADOW,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        ".toolbox-load-balancer .learn-toolbox-item",
        {
          backgroundColor: "rgba(255, 255, 255, 0.075)",
          borderColor: "rgba(255, 255, 255, 0.15)",
          duration: 0.3,
        },
        "<"
      );

      /* Fan-out routes */

      timeline.to(".solve-route", {
        strokeDashoffset: 0,
        duration: 0.8,
        stagger: 0.12,
        ease: "power2.inOut",
      });

      timeline.to(
        [
          ".solve-server-one",
          ".solve-server-two",
          ".solve-server-three",
        ],
        {
          autoAlpha: 1,
          scale: 1,
          duration: 0.45,
          stagger: 0.12,
          ease: "back.out(1.5)",
        },
        "-=0.25"
      );

      /* Distributed requests */

      timeline.set(".solve-request-one", {
        autoAlpha: 1,
        x: 0,
        y: 0,
      });

      timeline.set(".solve-request-two", {
        autoAlpha: 1,
        x: 0,
        y: 0,
      });

      timeline.set(".solve-request-three", {
        autoAlpha: 1,
        x: 0,
        y: 0,
      });

      timeline.to(
        ".solve-request-one",
        {
          x: -170,
          y: 112,
          duration: 0.8,
          ease: "none",
        }
      );

      timeline.to(
        ".solve-request-two",
        {
          x: 0,
          y: 112,
          duration: 0.8,
          ease: "none",
        },
        "<"
      );

      timeline.to(
        ".solve-request-three",
        {
          x: 170,
          y: 112,
          duration: 0.8,
          ease: "none",
        },
        "<"
      );

      timeline.to(
        ".solve-request",
        {
          autoAlpha: 0,
          duration: 0.15,
        }
      );

      timeline.to(
        ".inspector-health-value",
        {
          textContent: "91",
          duration: 0.35,
        }
      );

      timeline.to(
        ".inspector-health-label",
        {
          textContent: "HEALTHY",
          duration: 0.35,
        },
        "<"
      );

      timeline.to(
        ".server-warning",
        {
          autoAlpha: 0,
          duration: 0.25,
        },
        "<"
      );

      timeline.to(".solve-success", {
        autoAlpha: 1,
        x: 0,
        duration: 0.5,
        ease: "power2.out",
      });

      timeline.to({}, { duration: 1.1 });

      /* =====================================================
         04 LEARN
      ===================================================== */
      /* =====================================================
   04 LEARN — WATCH WHY THE FIX WORKS
===================================================== */

/* =====================================================
   ENTER LEARN
===================================================== */

timeline.set(".solve-request", {
  autoAlpha: 0,
  x: 0,
  y: 0,
});

timeline.to(".progress-solve", {
  opacity: 0.34,
  duration: 0.25,
});

timeline.to(
  ".progress-learn",
  {
    opacity: 1,
    duration: 0.25,
  },
  "<"
);

moveProgressIndicator(3);

/* Remove SOLVE overlays */

timeline.to(
  [
    ".solve-success",
    ".solve-concept-card",
    ".solve-panel",
    ".break-traffic-panel",
    ".break-result",
  ],
  {
    autoAlpha: 0,
    duration: 0.4,
  }
);

/* Switch inspector SOLVE → LEARN */

timeline.to(".inspector-guide-solve", {
  autoAlpha: 0,
  duration: 0.25,
});

timeline.set(".inspector-guide-solve", {
  display: "none",
});

timeline.set(".inspector-guide-learn", {
  display: "block",
});

timeline.to(".inspector-guide-learn", {
  autoAlpha: 1,
  duration: 0.4,
});

/* Reset architecture appearance */

timeline.to(
  [
    ".solve-load-balancer .story-node",
    ".solve-server-one .story-node",
    ".solve-server-two .story-node",
    ".solve-server-three .story-node",
  ],
  {
    opacity: 1,
    borderColor: "rgba(10, 10, 10, 0.16)",
    boxShadow: NORMAL_NODE_SHADOW,
    duration: 0.35,
  }
);

timeline.to(".solve-route", {
  stroke: "rgba(10, 10, 10, 0.32)",
  strokeWidth: 1.2,
  duration: 0.3,
});

/* =====================================================
   STEP 1 — WHAT CHANGED?
===================================================== */

timeline.to(
  ".inspector-guide-learn .learn-guide-heading strong",
  {
    textContent: "Watch how requests are shared",
    duration: 0.1,
  }
);

timeline.to(".inspector-guide-learn > p", {
  textContent:
    "The load balancer receives each request and decides which server should handle it.",
  duration: 0.1,
});

timeline.to(".solve-load-balancer .story-node", {
  borderColor: "rgba(10, 10, 10, 0.7)",
  boxShadow: ACTIVE_NODE_SHADOW,
  duration: 0.4,
});

timeline.to({}, { duration: 0.7 });

/* =====================================================
   STEP 2 — REQUEST 1 → SERVER 1
===================================================== */

timeline.to(".inspector-guide-learn > p", {
  textContent:
    "Request 1 arrives. The load balancer sends it to Server 1.",
  duration: 0.1,
});

timeline.to(".route-left", {
  stroke: "rgba(10, 10, 10, 0.9)",
  strokeWidth: 2.2,
  duration: 0.25,
});

timeline.set(".solve-request-one", {
  autoAlpha: 1,
  x: 0,
  y: 0,
});

timeline.to(".solve-request-one", {
  x: -170,
  y: 112,
  duration: 0.85,
  ease: "none",
});

timeline.to(
  ".solve-server-one .story-node",
  {
    borderColor: "rgba(10, 10, 10, 0.62)",
    boxShadow: ACTIVE_NODE_SHADOW,
    duration: 0.3,
  },
  "-=0.15"
);

timeline.to(".solve-request-one", {
  autoAlpha: 0,
  duration: 0.15,
});

timeline.to(".solve-server-one .story-node", {
  borderColor: "rgba(10, 10, 10, 0.16)",
  boxShadow: NORMAL_NODE_SHADOW,
  duration: 0.25,
});

timeline.to(
  ".route-left",
  {
    stroke: "rgba(10, 10, 10, 0.32)",
    strokeWidth: 1.2,
    duration: 0.2,
  },
  "<"
);

/* =====================================================
   STEP 3 — REQUEST 2 → SERVER 2
===================================================== */

timeline.to(".inspector-guide-learn > p", {
  textContent:
    "Request 2 arrives next. It can be sent to Server 2 instead.",
  duration: 0.1,
});

timeline.to(".route-center", {
  stroke: "rgba(10, 10, 10, 0.9)",
  strokeWidth: 2.2,
  duration: 0.25,
});

timeline.set(".solve-request-two", {
  autoAlpha: 1,
  x: 0,
  y: 0,
});

timeline.to(".solve-request-two", {
  x: 0,
  y: 112,
  duration: 0.85,
  ease: "none",
});

timeline.to(
  ".solve-server-two .story-node",
  {
    borderColor: "rgba(10, 10, 10, 0.62)",
    boxShadow: ACTIVE_NODE_SHADOW,
    duration: 0.3,
  },
  "-=0.15"
);

timeline.to(".solve-request-two", {
  autoAlpha: 0,
  duration: 0.15,
});

timeline.to(".solve-server-two .story-node", {
  borderColor: "rgba(10, 10, 10, 0.16)",
  boxShadow: NORMAL_NODE_SHADOW,
  duration: 0.25,
});

timeline.to(
  ".route-center",
  {
    stroke: "rgba(10, 10, 10, 0.32)",
    strokeWidth: 1.2,
    duration: 0.2,
  },
  "<"
);

/* =====================================================
   STEP 4 — REQUEST 3 → SERVER 3
===================================================== */

timeline.to(".inspector-guide-learn > p", {
  textContent:
    "Request 3 arrives. This one goes to Server 3.",
  duration: 0.1,
});

timeline.to(".route-right", {
  stroke: "rgba(10, 10, 10, 0.9)",
  strokeWidth: 2.2,
  duration: 0.25,
});

timeline.set(".solve-request-three", {
  autoAlpha: 1,
  x: 0,
  y: 0,
});

timeline.to(".solve-request-three", {
  x: 170,
  y: 112,
  duration: 0.85,
  ease: "none",
});

timeline.to(
  ".solve-server-three .story-node",
  {
    borderColor: "rgba(10, 10, 10, 0.62)",
    boxShadow: ACTIVE_NODE_SHADOW,
    duration: 0.3,
  },
  "-=0.15"
);

timeline.to(".solve-request-three", {
  autoAlpha: 0,
  duration: 0.15,
});

timeline.to(".solve-server-three .story-node", {
  borderColor: "rgba(10, 10, 10, 0.16)",
  boxShadow: NORMAL_NODE_SHADOW,
  duration: 0.25,
});

timeline.to(
  ".route-right",
  {
    stroke: "rgba(10, 10, 10, 0.32)",
    strokeWidth: 1.2,
    duration: 0.2,
  },
  "<"
);

/* =====================================================
   STEP 5 — WHY IS THIS BETTER?
===================================================== */

timeline.to(
  ".inspector-guide-learn .learn-guide-heading strong",
  {
    textContent: "Now the work is shared",
    duration: 0.1,
  }
);

timeline.to(".inspector-guide-learn > p", {
  textContent:
    "Instead of every request piling onto one server, multiple servers share the workload.",
  duration: 0.1,
});

timeline.to(
  [
    ".solve-server-one .story-node",
    ".solve-server-two .story-node",
    ".solve-server-three .story-node",
  ],
  {
    borderColor: "rgba(10, 10, 10, 0.48)",
    boxShadow: ACTIVE_NODE_SHADOW,
    duration: 0.4,
  }
);

timeline.to(".solve-route", {
  stroke: "rgba(10, 10, 10, 0.62)",
  strokeWidth: 1.5,
  duration: 0.4,
});

timeline.to({}, { duration: 0.8 });

/* =====================================================
   STEP 6 — GIVE IT A NAME
===================================================== */

timeline.to(
  ".inspector-guide-learn .learn-guide-heading strong",
  {
    textContent: "You just learned horizontal scaling",
    duration: 0.1,
  }
);

timeline.to(
  ".inspector-guide-learn .learn-guide-component strong",
  {
    textContent: "Horizontal Scaling",
    duration: 0.1,
  }
);

timeline.to(".inspector-guide-learn > p", {
  textContent:
    "Horizontal scaling means adding more servers so the workload can be shared as traffic grows.",
  duration: 0.1,
});

timeline.to(
  [
    ".solve-load-balancer .story-node",
    ".solve-server-one .story-node",
    ".solve-server-two .story-node",
    ".solve-server-three .story-node",
  ],
  {
    borderColor: "rgba(10, 10, 10, 0.16)",
    boxShadow: NORMAL_NODE_SHADOW,
    duration: 0.35,
  }
);

timeline.to({}, { duration: 1.2 });

/* =====================================================
   05 CHALLENGE — ENTER
   Solved Instagram architecture stays in place; only
   mode, progress, and inspector state change.
===================================================== */

/* Extra read time on the final LEARN explanation */

timeline.to({}, { duration: 0.5 });

timeline.to(".progress-learn", {
  opacity: 0.34,
  duration: 0.25,
});

timeline.to(
  ".progress-challenge",
  {
    opacity: 1,
    duration: 0.25,
  },
  "<"
);

moveProgressIndicator(4);

/* Mode labels: LEARN MODE → CHALLENGE MODE */

const MODE_LABELS = [
  ".learn-mode-pill",
  ".learn-mode-control > span:last-child",
];

timeline.to(
  MODE_LABELS,
  {
    autoAlpha: 0,
    duration: 0.2,
  },
  "<"
);

timeline.set(MODE_LABELS, {
  textContent: "CHALLENGE MODE",
});

timeline.to(MODE_LABELS, {
  autoAlpha: 1,
  duration: 0.25,
});

/* Switch inspector LEARN → CHALLENGE */

timeline.to(".inspector-guide-learn", {
  autoAlpha: 0,
  y: -6,
  duration: 0.3,
});

timeline.set(".inspector-guide-learn", {
  display: "none",
});

timeline.set(".inspector-guide-challenge", {
  display: "block",
});

timeline.to(".inspector-guide-challenge", {
  autoAlpha: 1,
  y: 0,
  duration: 0.45,
});

timeline.to(
  ".challenge-canvas-tag",
  {
    autoAlpha: 1,
    y: 0,
    duration: 0.35,
  },
  "<0.1"
);

/* Hold the completed CHALLENGE state for reading */

timeline.to({}, { duration: 1.6 });

/* =====================================================
   05 CHALLENGE — ADD CACHE
   Same cursor + drag-ghost pattern as 01 BUILD.
===================================================== */

/* Start the cursor over the canvas, then reveal the layer */

timeline.set(".story-demo-cursor", {
  x: () =>
    getCursorPoint(".story-demo-canvas", 0.62, 0.42).x,
  y: () =>
    getCursorPoint(".story-demo-canvas", 0.62, 0.42).y,
  scale: 1,
  autoAlpha: 1,
});

timeline.set(".story-demo-cursor-label", {
  autoAlpha: 0,
  y: 3,
});

timeline.to(".challenge-cursor-layer", {
  autoAlpha: 1,
  duration: 0.2,
});

timeline.to(".story-demo-cursor", {
  x: () =>
    getCursorPoint(
      ".toolbox-cache .learn-toolbox-plus",
      0.5,
      0.5
    ).x,
  y: () =>
    getCursorPoint(
      ".toolbox-cache .learn-toolbox-plus",
      0.5,
      0.5
    ).y,
  duration: 0.8,
  ease: "power2.inOut",
});

timeline.to(
  ".toolbox-cache .learn-toolbox-item",
  {
    backgroundColor: "rgba(255, 255, 255, 0.075)",
    borderColor: "rgba(255, 255, 255, 0.15)",
    duration: 0.25,
  },
  "-=0.2"
);

/* click */

timeline.to(".story-demo-cursor", {
  scale: 0.82,
  duration: 0.12,
});

timeline.to(
  ".toolbox-cache .learn-toolbox-item",
  {
    scale: 0.97,
    duration: 0.12,
  },
  "<"
);

/* No DRAG label in Challenge Mode; keep the beat so timing is unchanged */

timeline.to({}, { duration: 0.18 });

/* Cache ghost appears over the toolbox row */

timeline.set(".story-drag-ghost-cache", {
  x: () =>
    getElementPoint(
      ".story-drag-ghost-cache",
      ".toolbox-cache .learn-toolbox-item",
      0.5,
      0.5
    ).x,
  y: () =>
    getElementPoint(
      ".story-drag-ghost-cache",
      ".toolbox-cache .learn-toolbox-item",
      0.5,
      0.5
    ).y,
});

timeline.to(".story-drag-ghost-cache", {
  autoAlpha: 0.9,
  scale: 1,
  duration: 0.2,
});

timeline.to(".toolbox-cache .learn-toolbox-item", {
  scale: 1,
  duration: 0.18,
});

/* Cursor + ghost move onto the canvas */

timeline.to(".story-demo-cursor", {
  x: () => getCursorPoint(".challenge-cache", 0.5, 0.5).x,
  y: () => getCursorPoint(".challenge-cache", 0.5, 0.5).y,
  scale: 1,
  duration: 1.1,
  ease: "power2.inOut",
});

timeline.to(
  ".story-drag-ghost-cache",
  {
    x: () =>
      getElementPoint(
        ".story-drag-ghost-cache",
        ".challenge-cache",
        0.5,
        0.5
      ).x,
    y: () =>
      getElementPoint(
        ".story-drag-ghost-cache",
        ".challenge-cache",
        0.5,
        0.5
      ).y,
    duration: 1.1,
    ease: "power2.inOut",
  },
  "<"
);

/* Drop */

timeline.to(".story-demo-cursor", {
  scale: 0.82,
  duration: 0.12,
});

timeline.to(
  ".story-drag-ghost-cache",
  {
    scale: 0.96,
    duration: 0.12,
  },
  "<"
);

timeline.to(".story-drag-ghost-cache", {
  autoAlpha: 0,
  duration: 0.18,
});

timeline.to(".story-demo-cursor", {
  scale: 1,
  duration: 0.15,
});

/* Cache joins the architecture */

timeline.to(
  ".challenge-cache",
  {
    autoAlpha: 1,
    y: 0,
    scale: 1,
    duration: 0.55,
    ease: "back.out(1.5)",
  },
  "<"
);

timeline.to(
  ".challenge-cache .story-node",
  {
    borderColor: "rgba(10, 10, 10, 0.5)",
    boxShadow: ACTIVE_NODE_SHADOW,
    duration: 0.35,
  },
  "<"
);

timeline.to(
  ".toolbox-cache .learn-toolbox-plus",
  {
    rotation: 45,
    opacity: 0.12,
    duration: 0.3,
  },
  "<"
);

timeline.to(
  ".toolbox-cache .learn-toolbox-item",
  {
    backgroundColor: "rgba(255, 255, 255, 0)",
    borderColor: "rgba(255, 255, 255, 0)",
    duration: 0.3,
  },
  "<"
);

timeline.to(".challenge-cache-link", {
  scaleX: 1,
  duration: 0.4,
  ease: "power2.inOut",
});

timeline.to(".challenge-cache .story-node", {
  borderColor: "rgba(10, 10, 10, 0.16)",
  boxShadow: NORMAL_NODE_SHADOW,
  duration: 0.3,
});

timeline.to({}, { duration: 0.4 });

/* =====================================================
   05 CHALLENGE — RUN SYSTEM
===================================================== */

timeline.to(".story-demo-cursor", {
  x: () => getCursorPoint(".learn-run-button", 0.5, 0.5).x,
  y: () => getCursorPoint(".learn-run-button", 0.5, 0.5).y,
  duration: 0.8,
  ease: "power2.inOut",
});

/* click */

timeline.to(".story-demo-cursor", {
  scale: 0.82,
  duration: 0.12,
});

timeline.to(
  ".learn-run-button",
  {
    scale: 0.96,
    duration: 0.12,
  },
  "<"
);

timeline.to(".story-demo-cursor", {
  scale: 1,
  duration: 0.15,
});

timeline.to(
  ".learn-run-button",
  {
    scale: 1,
    duration: 0.15,
  },
  "<"
);

/* Evaluating: button label + spec dims while nodes are checked */

timeline.set(".learn-run-label", {
  textContent: "Evaluating…",
});

timeline.to(
  ".inspector-guide-challenge",
  {
    opacity: 0.5,
    duration: 0.2,
  },
  "<"
);

const EVALUATED_NODES = [
  ".solve-load-balancer .story-node",
  ".solve-server-one .story-node",
  ".solve-server-two .story-node",
  ".solve-server-three .story-node",
  ".story-database .story-node",
  ".challenge-cache .story-node",
];

timeline.to(EVALUATED_NODES, {
  borderColor: "rgba(10, 10, 10, 0.5)",
  boxShadow: ACTIVE_NODE_SHADOW,
  duration: 0.3,
  stagger: 0.08,
});

timeline.to(EVALUATED_NODES, {
  borderColor: "rgba(10, 10, 10, 0.16)",
  boxShadow: NORMAL_NODE_SHADOW,
  duration: 0.3,
});

timeline.set(".learn-run-label", {
  textContent: "Run system",
});

/* =====================================================
   05 CHALLENGE — RESULT
===================================================== */

timeline.to(".inspector-health-value", {
  textContent: 96,
  snap: { textContent: 1 },
  duration: 0.4,
});

timeline.set(
  ".inspector-health-label",
  {
    textContent: "REQUIREMENTS MET",
  },
  "<"
);

const CHALLENGE_SCORES = [
  { row: 1, value: 96 },
  { row: 2, value: 94 },
  { row: 3, value: 97 },
  { row: 4, value: 88 },
];

CHALLENGE_SCORES.forEach(({ row, value }) => {
  const rowSelector = `.learn-score-row:nth-child(${row})`;

  timeline.to(
    `${rowSelector} strong`,
    {
      textContent: value,
      snap: { textContent: 1 },
      duration: 0.4,
    },
    "<"
  );

  timeline.to(
    `${rowSelector} .learn-score-fill`,
    {
      width: `${value}%`,
      duration: 0.4,
    },
    "<"
  );
});

/* Inspector: requirements spec → challenge result */

timeline.to(".inspector-guide-challenge", {
  autoAlpha: 0,
  y: -6,
  duration: 0.3,
});

timeline.set(".inspector-guide-challenge", {
  display: "none",
});

timeline.set(".inspector-guide-challenge-result", {
  display: "block",
});

timeline.to(".inspector-guide-challenge-result", {
  autoAlpha: 1,
  y: 0,
  duration: 0.45,
});

/* Cursor leaves */

timeline.to(
  ".story-demo-cursor",
  {
    x: "+=40",
    y: "-=30",
    autoAlpha: 0,
    duration: 0.4,
    ease: "power2.in",
  },
  "<"
);

timeline.set(".challenge-cursor-layer", {
  autoAlpha: 0,
});

/* Hold the challenge result */

timeline.to({}, { duration: 1.6 });

/* =====================================================
   FINAL DEMO — LEAVE THE TUTORIAL
   Same workspace shell; the Instagram exercise fades
   out as one unit and the tutorial chrome resets.
===================================================== */

timeline.to({}, { duration: 0.6 });

const PROJECT_NAME = ".learn-project-name > span:last-child";

timeline.to(".inspector-guide-challenge-result", {
  autoAlpha: 0,
  y: -6,
  duration: 0.4,
});

timeline.to(
  ".learn-score-section",
  {
    autoAlpha: 0,
    duration: 0.4,
  },
  "<"
);

timeline.to(
  [...MODE_LABELS, PROJECT_NAME],
  {
    autoAlpha: 0,
    duration: 0.3,
  },
  "<"
);

timeline.to(
  ".story-demo-progress",
  {
    autoAlpha: 0,
    duration: 0.5,
  },
  "<"
);

timeline.to(
  ".story-build-area",
  {
    autoAlpha: 0,
    duration: 0.8,
    ease: "power1.inOut",
  },
  "<0.1"
);

timeline.set(
  [".inspector-guide-challenge-result", ".learn-score-section"],
  {
    display: "none",
  }
);

timeline.set(MODE_LABELS, {
  textContent: "ARCHITECTURE",
});

timeline.set(PROJECT_NAME, {
  textContent: "New project",
});

timeline.to([...MODE_LABELS, PROJECT_NAME], {
  autoAlpha: 1,
  duration: 0.3,
});

/* =====================================================
   FINAL DEMO — REPOSITORY IMPORT
===================================================== */

timeline.to(".repo-demo-import", {
  autoAlpha: 1,
  y: 0,
  duration: 0.45,
});

timeline.set(".story-demo-cursor", {
  x: () =>
    getCursorPoint(".story-demo-canvas", 0.7, 0.72).x,
  y: () =>
    getCursorPoint(".story-demo-canvas", 0.7, 0.72).y,
  scale: 1,
  autoAlpha: 1,
});

timeline.to(".challenge-cursor-layer", {
  autoAlpha: 1,
  duration: 0.2,
});

/* Cursor → repository field */

timeline.to(".story-demo-cursor", {
  x: () => getCursorPoint(".repo-demo-field", 0.42, 0.5).x,
  y: () => getCursorPoint(".repo-demo-field", 0.42, 0.5).y,
  duration: 0.7,
  ease: "power2.inOut",
});

timeline.to(".story-demo-cursor", {
  scale: 0.82,
  duration: 0.12,
});

timeline.to(
  ".repo-demo-field",
  {
    borderColor: "rgba(10, 10, 10, 0.55)",
    duration: 0.12,
  },
  "<"
);

timeline.to(".story-demo-cursor", {
  scale: 1,
  duration: 0.15,
});

/* Paste-style URL reveal */

timeline.to(".repo-demo-placeholder", {
  autoAlpha: 0,
  duration: 0.12,
});

timeline.to(".repo-demo-url", {
  autoAlpha: 1,
  duration: 0.2,
});

timeline.to({}, { duration: 0.3 });

/* Cursor → Import */

timeline.to(".story-demo-cursor", {
  x: () =>
    getCursorPoint(".repo-demo-import-button", 0.5, 0.5).x,
  y: () =>
    getCursorPoint(".repo-demo-import-button", 0.5, 0.5).y,
  duration: 0.55,
  ease: "power2.inOut",
});

timeline.to(".story-demo-cursor", {
  scale: 0.82,
  duration: 0.12,
});

timeline.to(
  ".repo-demo-import-button",
  {
    scale: 0.95,
    duration: 0.12,
  },
  "<"
);

timeline.to(".story-demo-cursor", {
  scale: 1,
  duration: 0.15,
});

timeline.to(
  ".repo-demo-import-button",
  {
    scale: 1,
    duration: 0.15,
  },
  "<"
);

timeline.to(".story-demo-cursor", {
  x: "+=36",
  y: "+=28",
  autoAlpha: 0,
  duration: 0.35,
  ease: "power2.in",
});

timeline.set(".challenge-cursor-layer", {
  autoAlpha: 0,
});

/* =====================================================
   FINAL DEMO — ANALYZING
===================================================== */

timeline.to(
  ".repo-demo-import",
  {
    autoAlpha: 0,
    y: -6,
    duration: 0.3,
  },
  "<"
);

timeline.to(".repo-demo-analysis", {
  autoAlpha: 1,
  y: 0,
  duration: 0.35,
});

timeline.to(
  PROJECT_NAME,
  {
    autoAlpha: 0,
    duration: 0.15,
  },
  "<"
);

timeline.set(PROJECT_NAME, {
  textContent: "StudyCast",
});

timeline.to(PROJECT_NAME, {
  autoAlpha: 1,
  duration: 0.2,
});

timeline.to(".repo-demo-finding", {
  autoAlpha: 1,
  x: 0,
  duration: 0.2,
  stagger: 0.28,
});

timeline.to(
  ".repo-demo-progress-fill",
  {
    scaleX: 1,
    duration: 1.32,
    ease: "none",
  },
  "<"
);

timeline.to({}, { duration: 0.45 });

timeline.to(".repo-demo-analysis", {
  autoAlpha: 0,
  y: -6,
  duration: 0.35,
});

/* =====================================================
   FINAL DEMO — GENERATE ARCHITECTURE
   Nodes and connections build top-down.
===================================================== */

const revealRepoNodes = (
  ids: string[],
  position?: string
) =>
  timeline.to(
    ids.map((id) => `.repo-demo-node-${id}`),
    {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      duration: 0.4,
      ease: "back.out(1.5)",
      stagger: 0.1,
    },
    position
  );

const drawRepoLines = (
  ids: string[],
  position?: string
) =>
  timeline.to(
    ids.map((id) => `.repo-demo-line-${id}`),
    {
      strokeDashoffset: 0,
      duration: 0.35,
      ease: "power2.inOut",
    },
    position
  );

revealRepoNodes(["user"]);
drawRepoLines(["user-web"]);
revealRepoNodes(["web"], "-=0.1");
drawRepoLines(["web-api"]);
revealRepoNodes(["api"], "-=0.1");
drawRepoLines(["api-redis", "api-postgres", "api-ai"]);
revealRepoNodes(["redis", "postgres", "ai"], "-=0.1");
drawRepoLines(["redis-queue"]);
revealRepoNodes(["queue"], "-=0.1");
drawRepoLines(["queue-worker"]);
revealRepoNodes(["worker"], "-=0.1");

/* Inspector → project overview */

timeline.set(".inspector-guide-repo", {
  display: "block",
});

timeline.to(".inspector-guide-repo", {
  autoAlpha: 1,
  y: 0,
  duration: 0.45,
});

timeline.to({}, { duration: 0.8 });

/* =====================================================
   FINAL DEMO — GET STARTED
===================================================== */

timeline.to(".learn-run-button", {
  autoAlpha: 0,
  duration: 0.25,
});

timeline.set(".learn-run-button", {
  display: "none",
});

timeline.set(".repo-demo-cta", {
  display: "flex",
});

timeline.to(".repo-demo-cta", {
  autoAlpha: 1,
  x: 0,
  duration: 0.4,
});

/* Final hold */

timeline.to({}, { duration: 1.5 });

      return () => {
        window.removeEventListener(
          "resize",
          renderProgressIndicator
        );
      };
    },
    {
      scope: sectionRef,
    }
  );

  return (
    <section
      ref={sectionRef}
      className="system-story"
      id="system-story"
    >
      <header className="system-story-intro">
        <span className="system-story-step">
          BUILD A REAL SYSTEM
        </span>

        <h2>
          Let&apos;s build
          <br />
          Instagram.
        </h2>

        <p>
          Start simple. We&apos;ll add complexity only when the
          system needs it.
        </p>
      </header>

      <div ref={demoRef}>
        <SystemCanvas onGetStarted={onGetStarted} />
      </div>
    </section>
  );
}