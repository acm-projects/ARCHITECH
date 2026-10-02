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

export default function SystemStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const demoRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!demoRef.current) return;

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
         INITIAL TOOLBOX STATE
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
         INITIAL WORKSPACE / INSPECTOR STATE
      ===================================================== */

      gsap.set(".inspector-guide", {
        autoAlpha: 0,
        display: "none",
      });

      gsap.set(".inspector-guide-build", {
        autoAlpha: 1,
        display: "block",
      });

      gsap.set(".learn-canvas-focus", {
        autoAlpha: 0,
        y: 10,
      });

      /*
       * Workspace shell is visible from frame one.
       * BUILD, BREAK, SOLVE and LEARN all happen inside it.
       */

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

      /* =====================================================
         MAIN SCROLL TIMELINE
      ===================================================== */

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: demoRef.current,
          start: "top 24px",
          end: "+=10800",
          scrub: 0.5,
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
        },
      });

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

      timeline.to({}, {
        duration: 0.25,
      });

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

      /* =====================================================
         TOOLBOX → SERVER

         The product itself teaches what component is needed.
      ===================================================== */

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

      timeline.to({}, {
        duration: 0.25,
      });

      /* =====================================================
         BUILD USER → SERVER CONNECTION
      ===================================================== */

      timeline.to(".connector-user-server", {
        autoAlpha: 1,
        duration: 0.1,
      });

      timeline.to(
        ".connector-user-server .story-connector-line",
        {
          scaleY: 1,
          duration: 0.8,
          ease: "none",
        }
      );

      timeline.to(
        ".connector-user-server .story-connector-arrow",
        {
          autoAlpha: 1,
          duration: 0.2,
        }
      );

      timeline.to(".story-server", {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.7,
        ease: "power2.out",
      });

      /* =====================================================
         SERVER ADDED → TOOLBOX CONFIRMS
      ===================================================== */

      timeline.to(
        ".toolbox-server .learn-toolbox-icon",
        {
          scale: 1,
          duration: 0.25,
        },
        "<"
      );

      timeline.to(
        ".toolbox-server .learn-toolbox-plus",
        {
          rotation: 45,
          opacity: 0.7,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        ".toolbox-server .learn-toolbox-item",
        {
          backgroundColor: "rgba(255, 255, 255, 0.035)",
          borderColor: "rgba(255, 255, 255, 0.08)",
          duration: 0.35,
        },
        "<"
      );

      /* =====================================================
         REQUEST: USER → SERVER
      ===================================================== */

      timeline.set(".traffic-dot-one", {
        autoAlpha: 1,
        top: "5%",
      });

      timeline.to(".traffic-dot-one", {
        top: "92%",
        duration: 0.8,
        ease: "none",
      });

      timeline.to(".story-user .story-node", {
        borderColor: "rgba(10, 10, 10, 0.16)",
        boxShadow: NORMAL_NODE_SHADOW,
        duration: 0.3,
      });

      timeline.to(
        ".story-user .story-node-status",
        {
          opacity: 0.3,
          scale: 1,
          duration: 0.3,
        },
        "<"
      );

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

      timeline.to(".traffic-dot-one", {
        autoAlpha: 0,
        duration: 0.15,
      });

      timeline.to({}, {
        duration: 0.25,
      });

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

      /* =====================================================
         TOOLBOX → DATABASE
      ===================================================== */

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

      timeline.to({}, {
        duration: 0.25,
      });

      /* =====================================================
         BUILD SERVER → DATABASE CONNECTION
      ===================================================== */

      timeline.to(".connector-server-db", {
        autoAlpha: 1,
        duration: 0.1,
      });

      timeline.to(
        ".connector-server-db .story-connector-line",
        {
          scaleY: 1,
          duration: 0.8,
          ease: "none",
        }
      );

      timeline.to(
        ".connector-server-db .story-connector-arrow",
        {
          autoAlpha: 1,
          duration: 0.2,
        }
      );

      timeline.to(".story-database", {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.7,
        ease: "power2.out",
      });

      /* =====================================================
         DATABASE ADDED → TOOLBOX CONFIRMS
      ===================================================== */

      timeline.to(
        ".toolbox-database .learn-toolbox-icon",
        {
          scale: 1,
          duration: 0.25,
        },
        "<"
      );

      timeline.to(
        ".toolbox-database .learn-toolbox-plus",
        {
          rotation: 45,
          opacity: 0.7,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        ".toolbox-database .learn-toolbox-item",
        {
          backgroundColor: "rgba(255, 255, 255, 0.035)",
          borderColor: "rgba(255, 255, 255, 0.08)",
          duration: 0.35,
        },
        "<"
      );

      /* =====================================================
         REQUEST: SERVER → DATABASE
      ===================================================== */

      timeline.set(".traffic-dot-two", {
        autoAlpha: 1,
        top: "5%",
      });

      timeline.to(".traffic-dot-two", {
        top: "92%",
        duration: 0.8,
        ease: "none",
      });

      timeline.to(".story-server .story-node", {
        borderColor: "rgba(10, 10, 10, 0.16)",
        boxShadow: NORMAL_NODE_SHADOW,
        duration: 0.3,
      });

      timeline.to(
        ".story-server .story-node-status",
        {
          opacity: 0.3,
          scale: 1,
          duration: 0.3,
        },
        "<"
      );

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

      timeline.to(".traffic-dot-two", {
        autoAlpha: 0,
        duration: 0.15,
      });

      /* =====================================================
         BUILD COMPLETE

         The canvas stops teaching through overlays.
         The Inspector summarizes what the visitor built.
      ===================================================== */

      timeline.to(".story-database .story-node", {
        borderColor: "rgba(10, 10, 10, 0.16)",
        boxShadow: NORMAL_NODE_SHADOW,
        duration: 0.35,
      });

      timeline.to(
        ".story-database .story-node-status",
        {
          opacity: 0.3,
          scale: 1,
          duration: 0.3,
        },
        "<"
      );

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
        duration: 0.4,
      });

      timeline.to(
        [
          ".story-user .story-node",
          ".story-server .story-node",
          ".story-database .story-node",
        ],
        {
          borderColor: "rgba(10, 10, 10, 0.28)",
          duration: 0.35,
        },
        "<"
      );

      timeline.to({}, {
        duration: 0.9,
      });

      /* =====================================================
         02 BREAK
      ===================================================== */

      timeline.to(".progress-build", {
        opacity: 0.25,
        duration: 0.3,
      });

      timeline.to(
        ".progress-break",
        {
          opacity: 1,
          duration: 0.3,
        },
        "<"
      );

      /* =====================================================
         GUIDE → BREAK
      ===================================================== */

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

      /* =====================================================
         TRAFFIC PANEL
      ===================================================== */

      timeline.to(
        ".break-traffic-panel",
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.55,
        },
        "<"
      );

      /* =====================================================
         100 → 1K
      ===================================================== */

      timeline.to(".traffic-scale-fill", {
        scaleX: 0.33,
        duration: 0.7,
        ease: "none",
      });

      timeline.to(
        ".traffic-scale-thumb",
        {
          left: "33%",
          duration: 0.7,
          ease: "none",
        },
        "<"
      );

      timeline.to(".traffic-value", {
        textContent: "1K",
        duration: 0.1,
      });

      timeline.to(
        [".break-particle-1", ".break-particle-2"],
        {
          autoAlpha: 1,
          duration: 0.2,
        }
      );

      timeline.fromTo(
        [".break-particle-1", ".break-particle-2"],
        {
          top: "4%",
        },
        {
          top: "92%",
          duration: 0.8,
          stagger: 0.14,
          ease: "none",
        }
      );

      /* =====================================================
         1K → 10K
      ===================================================== */

      timeline.to(".traffic-scale-fill", {
        scaleX: 0.66,
        duration: 0.7,
        ease: "none",
      });

      timeline.to(
        ".traffic-scale-thumb",
        {
          left: "66%",
          duration: 0.7,
          ease: "none",
        },
        "<"
      );

      timeline.to(".traffic-value", {
        textContent: "10K",
        duration: 0.1,
      });

      timeline.to(
        [".break-particle-3", ".break-particle-4"],
        {
          autoAlpha: 1,
          duration: 0.2,
        }
      );

      timeline.fromTo(
        [".break-particle-3", ".break-particle-4"],
        {
          top: "4%",
        },
        {
          top: "92%",
          duration: 0.65,
          stagger: 0.1,
          ease: "none",
        }
      );

      timeline.to(".story-server .story-node", {
        scale: 1.035,
        borderColor: "rgba(10, 10, 10, 0.6)",
        boxShadow: ACTIVE_NODE_SHADOW,
        duration: 0.18,
        repeat: 3,
        yoyo: true,
      });

      /* =====================================================
         HEALTH 92 → 68
      ===================================================== */

      timeline.to(
        ".inspector-health-value",
        {
          textContent: "68",
          duration: 0.1,
        },
        "<+=0.2"
      );

      timeline.to(
        ".inspector-health-label",
        {
          textContent: "STRESSED",
          duration: 0.1,
        },
        "<"
      );

      /* =====================================================
         10K → 100K
      ===================================================== */

      timeline.to(".traffic-scale-fill", {
        scaleX: 1,
        duration: 0.8,
        ease: "none",
      });

      timeline.to(
        ".traffic-scale-thumb",
        {
          left: "100%",
          duration: 0.8,
          ease: "none",
        },
        "<"
      );

      timeline.to(".traffic-value", {
        textContent: "100K",
        duration: 0.1,
      });

      timeline.to(".break-particle", {
        autoAlpha: 1,
        duration: 0.15,
      });

      timeline.fromTo(
        ".break-particle",
        {
          top: "2%",
        },
        {
          top: "94%",
          duration: 0.55,
          stagger: 0.07,
          ease: "none",
        }
      );

      timeline.to(".story-server .story-node", {
        borderColor: "rgba(10, 10, 10, 0.75)",
        boxShadow: OVERLOADED_NODE_SHADOW,
        duration: 0.35,
      });

      timeline.to(
        ".story-server .story-node-status",
        {
          opacity: 1,
          scale: 1.7,
          duration: 0.35,
        },
        "<"
      );

      /* =====================================================
         OVERLOAD
      ===================================================== */

      timeline.to(".story-server .story-node", {
        x: -4,
        duration: 0.07,
        repeat: 7,
        yoyo: true,
      });

      timeline.set(".story-server .story-node", {
        x: 0,
      });

      timeline.to(".server-warning", {
        autoAlpha: 1,
        duration: 0.3,
      });

      timeline.to(
        ".inspector-health-value",
        {
          textContent: "38",
          duration: 0.1,
        },
        "<+=0.15"
      );

      timeline.to(
        ".inspector-health-label",
        {
          textContent: "OVERLOADED",
          duration: 0.1,
        },
        "<"
      );

      /* =====================================================
         YOU BROKE IT
      ===================================================== */

      timeline.to(
        ".break-result",
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.65,
          ease: "power2.out",
        },
        "+=0.2"
      );

      timeline.to({}, {
        duration: 0.8,
      });

      /* =====================================================
         03 SOLVE
      ===================================================== */

      timeline.to(".progress-break", {
        opacity: 0.25,
        duration: 0.3,
      });

      timeline.to(
        ".progress-solve",
        {
          opacity: 1,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        [".break-result", ".break-particle", ".server-warning"],
        {
          autoAlpha: 0,
          duration: 0.35,
        }
      );

      /* =====================================================
         GUIDE → SOLVE
      ===================================================== */

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

      /* =====================================================
         ASK FOR SOLUTION
      ===================================================== */

      timeline.to(
        ".solve-panel",
        {
          autoAlpha: 1,
          x: 0,
          duration: 0.65,
          ease: "power2.out",
        },
        "<"
      );

      timeline.to({}, {
        duration: 0.6,
      });

      /* =====================================================
         SELECT SPREAD TRAFFIC
      ===================================================== */

      timeline.to(".solve-option-load", {
        borderColor: "rgba(10, 10, 10, 0.65)",
        boxShadow:
          "0 0 0 3px #ffffff, 0 0 0 5px rgba(10, 10, 10, 0.1)",
        duration: 0.4,
      });

      timeline.to(
        [".solve-option-cache", ".solve-option-data"],
        {
          opacity: 0.28,
          duration: 0.4,
        },
        "<"
      );

      timeline.to({}, {
        duration: 0.4,
      });

      /* =====================================================
         REVEAL LOAD BALANCER
      ===================================================== */

      timeline.to(".solve-panel", {
        autoAlpha: 0,
        x: -12,
        duration: 0.4,
      });

      timeline.to(
        ".solve-concept-card",
        {
          autoAlpha: 1,
          x: 0,
          duration: 0.55,
          ease: "power2.out",
        },
        "-=0.1"
      );

      timeline.to({}, {
        duration: 0.55,
      });

      /* =====================================================
         REMOVE OLD SERVER PATH
      ===================================================== */

      timeline.to(".story-server", {
        autoAlpha: 0,
        scale: 0.92,
        duration: 0.4,
      });

      timeline.to(
        [".connector-user-server", ".connector-server-db"],
        {
          autoAlpha: 0,
          duration: 0.3,
        },
        "<"
      );

      /* =====================================================
         SOLVED ARCHITECTURE
      ===================================================== */

      timeline.to(".solve-architecture", {
        autoAlpha: 1,
        duration: 0.15,
      });

      timeline.to(".solve-line-user-lb", {
        scaleY: 1,
        duration: 0.5,
        ease: "none",
      });

      timeline.to(".solve-load-balancer", {
        autoAlpha: 1,
        scale: 1,
        duration: 0.5,
        ease: "power2.out",
      });

      timeline.to(".solve-load-balancer .story-node", {
        borderColor: "rgba(10, 10, 10, 0.55)",
        boxShadow: ACTIVE_NODE_SHADOW,
        duration: 0.3,
      });

      /* =====================================================
         FAN OUT
      ===================================================== */

      timeline.to(".solve-route", {
        strokeDashoffset: 0,
        duration: 0.8,
        stagger: 0.08,
        ease: "none",
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
          duration: 0.5,
          stagger: 0.1,
          ease: "power2.out",
        }
      );

      /* =====================================================
         DISTRIBUTED REQUESTS
      ===================================================== */

      timeline.to(".solve-request", {
        autoAlpha: 1,
        duration: 0.15,
      });

      timeline.fromTo(
        ".solve-request-one",
        {
          x: 0,
          y: 0,
        },
        {
          x: -170,
          y: 112,
          duration: 0.7,
          ease: "none",
        }
      );

      timeline.fromTo(
        ".solve-request-two",
        {
          x: 0,
          y: 0,
        },
        {
          x: 0,
          y: 112,
          duration: 0.7,
          ease: "none",
        },
        "<+=0.08"
      );

      timeline.fromTo(
        ".solve-request-three",
        {
          x: 0,
          y: 0,
        },
        {
          x: 170,
          y: 112,
          duration: 0.7,
          ease: "none",
        },
        "<+=0.08"
      );

      timeline.to(".solve-server-one .story-node", {
        borderColor: "rgba(10, 10, 10, 0.5)",
        boxShadow: ACTIVE_NODE_SHADOW,
        duration: 0.3,
      });

      timeline.to(
        ".solve-server-two .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.5)",
          boxShadow: ACTIVE_NODE_SHADOW,
          duration: 0.3,
        },
        "<+=0.08"
      );

      timeline.to(
        ".solve-server-three .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.5)",
          boxShadow: ACTIVE_NODE_SHADOW,
          duration: 0.3,
        },
        "<+=0.08"
      );

      /* =====================================================
         SYSTEM RECOVERS
      ===================================================== */

      timeline.to(".inspector-health-value", {
        textContent: "91",
        duration: 0.1,
      });

      timeline.to(
        ".inspector-health-label",
        {
          textContent: "HEALTHY",
          duration: 0.1,
        },
        "<"
      );

      timeline.to(".solve-concept-card", {
        autoAlpha: 0,
        x: -12,
        duration: 0.4,
      });

      timeline.to(
        ".solve-success",
        {
          autoAlpha: 1,
          x: 0,
          duration: 0.6,
          ease: "power2.out",
        },
        "-=0.1"
      );

      timeline.to({}, {
        duration: 0.8,
      });

      /* =====================================================
         04 LEARN

         Same workspace. No fake product reveal.
      ===================================================== */

      timeline.to(".progress-solve", {
        opacity: 0.25,
        duration: 0.3,
      });

      timeline.to(
        ".progress-learn",
        {
          opacity: 1,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        [".solve-success", ".break-traffic-panel"],
        {
          autoAlpha: 0,
          duration: 0.4,
        }
      );

      /* =====================================================
         GUIDE → LEARN
      ===================================================== */

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

      /* =====================================================
         SELECT LOAD BALANCER
      ===================================================== */

      timeline.to(
        ".solve-load-balancer .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.78)",
          boxShadow:
            "0 0 0 3px #ffffff, 0 0 0 5px rgba(10,10,10,.16), 0 16px 38px rgba(10,10,10,.14)",
          duration: 0.4,
        },
        "<"
      );

      timeline.to(
        ".solve-load-balancer .story-node-status",
        {
          opacity: 1,
          scale: 1.6,
          duration: 0.35,
        },
        "<"
      );

      timeline.to(
        ".learn-canvas-focus",
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.5,
          ease: "power2.out",
        },
        "<+=0.15"
      );

      /* =====================================================
         EMPHASIZE ROUTING
      ===================================================== */

      timeline.to(".solve-route", {
        strokeWidth: 1.6,
        stroke: "rgba(10, 10, 10, 0.65)",
        duration: 0.4,
      });

      timeline.to(
        [
          ".solve-server-one .story-node",
          ".solve-server-two .story-node",
          ".solve-server-three .story-node",
        ],
        {
          borderColor: "rgba(10, 10, 10, 0.42)",
          duration: 0.4,
        },
        "<"
      );

      timeline.to({}, {
        duration: 1.3,
      });
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
          Let's build
          <br />
          Instagram.
        </h2>

        <p>
          Start simple. We'll add complexity only when the
          system needs it.
        </p>
      </header>

      <div ref={demoRef}>
        <SystemCanvas />
      </div>
    </section>
  );
}