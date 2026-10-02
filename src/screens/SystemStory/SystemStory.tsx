import { useRef } from "react";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

import "./SystemStory.css";
import SystemCanvas from "./SystemCanvas";

gsap.registerPlugin(ScrollTrigger);

export default function SystemStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const demoRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!demoRef.current) return;

      /* =========================================
         INITIAL BUILD STATE
      ========================================= */

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

      /* =========================================
         BUILD TIMELINE
      ========================================= */

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: demoRef.current,
          start: "top 24px",
          end: "+=3200",
          scrub: 0.5,
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
        },
      });

      /* =========================================
         1 — USER
      ========================================= */

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

      /* =========================================
         2 — SERVER QUESTION
      ========================================= */

      timeline.to(
        ".prompt-server",
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.7,
        },
        "+=0.35"
      );

      /* =========================================
         3 — USER → SERVER CONNECTION
      ========================================= */

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

      /* =========================================
         4 — SERVER
      ========================================= */

      timeline.to(".story-server", {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.7,
        ease: "power2.out",
      });

      /* =========================================
         5 — REQUEST TRAVELS TO SERVER
      ========================================= */

      timeline.set(".traffic-dot-one", {
        autoAlpha: 1,
        top: "5%",
      });

      timeline.to(".traffic-dot-one", {
        top: "92%",
        duration: 0.8,
        ease: "none",
      });

      timeline.to(".traffic-dot-one", {
        autoAlpha: 0,
        duration: 0.15,
      });

      /* =========================================
         6 — CLEAR SERVER LESSON
      ========================================= */

      timeline.to(
        ".prompt-server",
        {
          autoAlpha: 0,
          y: -8,
          duration: 0.45,
        },
        "+=0.25"
      );

      /* =========================================
         7 — DATABASE QUESTION
      ========================================= */

      timeline.to(".prompt-database", {
        autoAlpha: 1,
        y: 0,
        duration: 0.7,
      });

      /* =========================================
         8 — SERVER → DATABASE CONNECTION
      ========================================= */

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

      /* =========================================
         9 — DATABASE
      ========================================= */

      timeline.to(".story-database", {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.7,
        ease: "power2.out",
      });

      /* =========================================
         10 — REQUEST TRAVELS TO DATABASE
      ========================================= */

      timeline.set(".traffic-dot-two", {
        autoAlpha: 1,
        top: "5%",
      });

      timeline.to(".traffic-dot-two", {
        top: "92%",
        duration: 0.8,
        ease: "none",
      });

      timeline.to(".traffic-dot-two", {
        autoAlpha: 0,
        duration: 0.15,
      });

      /* =========================================
         11 — CLEAR DATABASE LESSON
      ========================================= */

      timeline.to(
        ".prompt-database",
        {
          autoAlpha: 0,
          y: -8,
          duration: 0.45,
        },
        "+=0.25"
      );

      /* =========================================
         12 — BASIC SYSTEM COMPLETE
      ========================================= */

      timeline.to(".story-build-complete", {
        autoAlpha: 1,
        duration: 0.6,
      });

      /* Breathing room before releasing canvas */

      timeline.to(
        {},
        {
          duration: 0.8,
        }
      );
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