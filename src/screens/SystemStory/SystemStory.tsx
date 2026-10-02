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
          ".prompt-server",
          ".prompt-database",
          ".story-build-complete",
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
        [".prompt-server", ".prompt-database"],
        {
          y: 10,
        }
      );

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
         INITIAL BREAK STATE
         ===================================================== */

      gsap.set(
        [
          ".break-traffic-panel",
          ".break-health-panel",
          ".break-result",
          ".server-warning",
          ".break-particle",
        ],
        {
          autoAlpha: 0,
        }
      );

      gsap.set(
        [".break-traffic-panel", ".break-health-panel"],
        {
          y: 12,
        }
      );

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

      gsap.set(".health-meter-fill", {
        scaleX: 0.92,
        transformOrigin: "left center",
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
         MAIN STORY TIMELINE
         ===================================================== */

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: demoRef.current,
          start: "top 24px",
          end: "+=8500",
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

      /*
       * USER ACTIVE
       */

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

      /* =====================================================
         TEACH SERVER
         ===================================================== */

      timeline.to(
        ".prompt-server",
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.7,
        },
        "+=0.35"
      );

      timeline.to(
        ".connector-user-server",
        {
          autoAlpha: 1,
          duration: 0.1,
        },
        "+=0.2"
      );

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

      /*
       * USER turns off.
       * SERVER lights up.
       */

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

      timeline.to(
        ".prompt-server",
        {
          autoAlpha: 0,
          y: -8,
          duration: 0.45,
        },
        "+=0.25"
      );

      /* =====================================================
         TEACH DATABASE
         ===================================================== */

      timeline.to(".prompt-database", {
        autoAlpha: 1,
        y: 0,
        duration: 0.7,
      });

      timeline.to(
        ".connector-server-db",
        {
          autoAlpha: 1,
          duration: 0.1,
        },
        "+=0.2"
      );

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

      /*
       * SERVER turns off.
       * DATABASE lights up.
       */

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

      timeline.to(
        ".prompt-database",
        {
          autoAlpha: 0,
          y: -8,
          duration: 0.45,
        },
        "+=0.25"
      );

      /*
       * Database finished processing.
       */

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

      /* =====================================================
         BUILD COMPLETE
         ===================================================== */

      timeline.to(".story-build-complete", {
        autoAlpha: 1,
        duration: 0.6,
      });

      timeline.to({}, {
        duration: 0.65,
      });

      /* =====================================================
         TRANSITION → 02 BREAK
         ===================================================== */

      timeline.to(".progress-build", {
        opacity: 0.25,
        duration: 0.35,
      });

      timeline.to(
        ".progress-break",
        {
          opacity: 1,
          duration: 0.35,
        },
        "<"
      );

      timeline.to(".story-build-complete", {
        autoAlpha: 0,
        duration: 0.35,
      });

      timeline.to(".canvas-status-text", {
        opacity: 0,
        duration: 0.2,
      });

      timeline.set(".canvas-status-text", {
        textContent: "LOAD TEST",
      });

      timeline.to(".canvas-status-text", {
        opacity: 1,
        duration: 0.2,
      });

      /* =====================================================
         BREAK CONTROLS
         ===================================================== */

      timeline.to(".break-traffic-panel", {
        autoAlpha: 1,
        y: 0,
        duration: 0.6,
      });

      timeline.to(
        ".break-health-panel",
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.6,
        },
        "<+=0.15"
      );

      /* =====================================================
         TRAFFIC: 100 → 1K
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

      /*
       * USER lights as requests enter.
       */

      timeline.to(
        ".story-user .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.5)",
          boxShadow: ACTIVE_NODE_SHADOW,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        ".story-user .story-node-status",
        {
          opacity: 1,
          scale: 1.4,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        [
          ".break-particle-1",
          ".break-particle-2",
        ],
        {
          autoAlpha: 1,
          duration: 0.25,
        }
      );

      timeline.fromTo(
        [
          ".break-particle-1",
          ".break-particle-2",
        ],
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

      /*
       * Requests reach SERVER.
       */

      timeline.to(".story-user .story-node", {
        borderColor: "rgba(10, 10, 10, 0.16)",
        boxShadow: NORMAL_NODE_SHADOW,
        duration: 0.25,
      });

      timeline.to(
        ".story-user .story-node-status",
        {
          opacity: 0.3,
          scale: 1,
          duration: 0.25,
        },
        "<"
      );

      timeline.to(
        ".story-server .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.5)",
          boxShadow: ACTIVE_NODE_SHADOW,
          duration: 0.3,
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

      /* =====================================================
         TRAFFIC: 1K → 10K
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
        [
          ".break-particle-3",
          ".break-particle-4",
        ],
        {
          autoAlpha: 1,
          duration: 0.2,
        }
      );

      timeline.fromTo(
        [
          ".break-particle-3",
          ".break-particle-4",
        ],
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

      /*
       * Server starts struggling.
       */

      timeline.to(
        ".story-server .story-node",
        {
          scale: 1.035,
          borderColor: "rgba(10, 10, 10, 0.6)",
          boxShadow: ACTIVE_NODE_SHADOW,
          duration: 0.18,
          repeat: 3,
          yoyo: true,
        }
      );

      timeline.to(
        ".health-meter-fill",
        {
          scaleX: 0.68,
          duration: 0.5,
        },
        "<"
      );

      timeline.to(
        ".health-value",
        {
          textContent: "68",
          duration: 0.1,
        },
        "<+=0.2"
      );

      timeline.to(
        ".health-label",
        {
          textContent: "STRESSED",
          duration: 0.1,
        },
        "<"
      );

      /* =====================================================
         TRAFFIC: 10K → 100K
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

      /*
       * Incoming traffic activates USER again.
       */

      timeline.to(
        ".story-user .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.5)",
          boxShadow: ACTIVE_NODE_SHADOW,
          duration: 0.25,
        },
        "<"
      );

      timeline.to(
        ".story-user .story-node-status",
        {
          opacity: 1,
          scale: 1.4,
          duration: 0.25,
        },
        "<"
      );

      timeline.to(
        [
          ".break-particle-1",
          ".break-particle-2",
          ".break-particle-3",
          ".break-particle-4",
          ".break-particle-5",
          ".break-particle-6",
        ],
        {
          autoAlpha: 1,
          duration: 0.15,
        }
      );

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

      /*
       * Load reaches server.
       * Server remains lit because it is overwhelmed.
       */

      timeline.to(".story-user .story-node", {
        borderColor: "rgba(10, 10, 10, 0.16)",
        boxShadow: NORMAL_NODE_SHADOW,
        duration: 0.25,
      });

      timeline.to(
        ".story-user .story-node-status",
        {
          opacity: 0.3,
          scale: 1,
          duration: 0.25,
        },
        "<"
      );

      timeline.to(
        ".story-server .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.75)",
          boxShadow: OVERLOADED_NODE_SHADOW,
          duration: 0.35,
        },
        "<"
      );

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
         SERVER OVERLOAD
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
        duration: 0.35,
      });

      timeline.to(".health-meter-fill", {
        scaleX: 0.38,
        duration: 0.7,
        ease: "power2.out",
      });

      timeline.to(
        ".health-value",
        {
          textContent: "38",
          duration: 0.1,
        },
        "<+=0.3"
      );

      timeline.to(
        ".health-label",
        {
          textContent: "OVERLOADED",
          duration: 0.1,
        },
        "<"
      );

      timeline.to(
        ".story-canvas-status > span:first-child",
        {
          scale: 1.8,
          opacity: 1,
          duration: 0.25,
          repeat: 3,
          yoyo: true,
        }
      );

      /* =====================================================
         YOU BROKE IT
         ===================================================== */

      timeline.to(
        ".break-result",
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.7,
          ease: "power2.out",
        },
        "+=0.25"
      );

      timeline.to({}, {
        duration: 1,
      });

      /* =====================================================
         TRANSITION → 03 SOLVE
         ===================================================== */

      timeline.to(".progress-break", {
        opacity: 0.25,
        duration: 0.35,
      });

      timeline.to(
        ".progress-solve",
        {
          opacity: 1,
          duration: 0.35,
        },
        "<"
      );

      timeline.to(".break-result", {
        autoAlpha: 0,
        y: -10,
        duration: 0.4,
      });

      /*
       * Clear the load-test noise while keeping the
       * broken architecture visible.
       */

      timeline.to(
        ".break-particle",
        {
          autoAlpha: 0,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        ".server-warning",
        {
          autoAlpha: 0,
          duration: 0.3,
        },
        "<"
      );

      /* =====================================================
         ASK: HOW WOULD YOU FIX IT?
         ===================================================== */

      timeline.to(".solve-panel", {
        autoAlpha: 1,
        x: 0,
        duration: 0.65,
        ease: "power2.out",
      });

      timeline.to({}, {
        duration: 0.7,
      });

      /* =====================================================
         SELECT: SPREAD TRAFFIC
         ===================================================== */

      timeline.to(".solve-option-load", {
        borderColor: "rgba(10, 10, 10, 0.65)",
        boxShadow:
          "0 0 0 3px #ffffff, 0 0 0 5px rgba(10, 10, 10, 0.1)",
        duration: 0.4,
      });

      timeline.to(
        [
          ".solve-option-cache",
          ".solve-option-data",
        ],
        {
          opacity: 0.28,
          duration: 0.4,
        },
        "<"
      );

      timeline.to({}, {
        duration: 0.45,
      });

      /* =====================================================
         REVEAL TECHNICAL CONCEPT
         ===================================================== */

      timeline.to(".solve-panel", {
        autoAlpha: 0,
        x: -12,
        duration: 0.45,
      });

      timeline.to(
        ".solve-concept-card",
        {
          autoAlpha: 1,
          x: 0,
          duration: 0.6,
          ease: "power2.out",
        },
        "-=0.1"
      );

      timeline.to({}, {
        duration: 0.65,
      });

      /* =====================================================
         REMOVE BROKEN SERVER
         ===================================================== */

      timeline.to(".story-server", {
        autoAlpha: 0,
        scale: 0.92,
        duration: 0.45,
      });

      timeline.to(
        ".connector-user-server",
        {
          autoAlpha: 0,
          duration: 0.3,
        },
        "<"
      );

      timeline.to(
        ".connector-server-db",
        {
          autoAlpha: 0,
          duration: 0.3,
        },
        "<"
      );

      /* =====================================================
         CREATE SOLVED ARCHITECTURE
         ===================================================== */

      timeline.to(".solve-architecture", {
        autoAlpha: 1,
        duration: 0.2,
      });

      timeline.to(".solve-line-user-lb", {
        scaleY: 1,
        duration: 0.55,
        ease: "none",
      });

      timeline.to(".solve-load-balancer", {
        autoAlpha: 1,
        scale: 1,
        duration: 0.5,
        ease: "power2.out",
      });

      /*
       * Load Balancer lights up first.
       */

      timeline.to(
        ".solve-load-balancer .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.55)",
          boxShadow: ACTIVE_NODE_SHADOW,
          duration: 0.35,
        }
      );

      /* =====================================================
         FAN TRAFFIC OUT
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
          duration: 0.55,
          stagger: 0.12,
          ease: "power2.out",
        }
      );

      /* =====================================================
         DISTRIBUTE REQUESTS
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

      /*
       * Traffic arrives at each server.
       * Each server lights as it starts processing.
       */

      timeline.to(
        ".solve-server-one .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.5)",
          boxShadow: ACTIVE_NODE_SHADOW,
          duration: 0.3,
        }
      );

      timeline.to(
        ".solve-server-two .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.5)",
          boxShadow: ACTIVE_NODE_SHADOW,
          duration: 0.3,
        },
        "<+=0.1"
      );

      timeline.to(
        ".solve-server-three .story-node",
        {
          borderColor: "rgba(10, 10, 10, 0.5)",
          boxShadow: ACTIVE_NODE_SHADOW,
          duration: 0.3,
        },
        "<+=0.1"
      );

      /* =====================================================
         HEALTH RECOVERS
         ===================================================== */

      timeline.to(".health-meter-fill", {
        scaleX: 0.91,
        duration: 0.8,
        ease: "power2.out",
      });

      timeline.to(
        ".health-value",
        {
          textContent: "91",
          duration: 0.1,
        },
        "<+=0.3"
      );

      timeline.to(
        ".health-label",
        {
          textContent: "HEALTHY",
          duration: 0.1,
        },
        "<"
      );

      timeline.to(".canvas-status-text", {
        opacity: 0,
        duration: 0.2,
      });

      timeline.set(".canvas-status-text", {
        textContent: "SYSTEM STABLE",
      });

      timeline.to(".canvas-status-text", {
        opacity: 1,
        duration: 0.2,
      });

      timeline.to(".component-count", {
        textContent: "6",
        duration: 0.1,
      });

      /* =====================================================
         SOLVE SUCCESS
         ===================================================== */

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
          duration: 0.65,
          ease: "power2.out",
        },
        "-=0.1"
      );

      timeline.to({}, {
        duration: 1,
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
          01 BUILD
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