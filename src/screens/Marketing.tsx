import { useEffect, useState } from "react";

import { Button, Icon, Logo } from "../components/ui";
import SystemStory from "./SystemStory/SystemStory";

const heroVerbs = [
  { label: "Build", motion: "build" },
  { label: "Break", motion: "break" },
  { label: "Understand", motion: "understand" },
  { label: "Stress", motion: "stress" },
  { label: "Scale", motion: "scale" },
  { label: "Fix", motion: "fix" },
] as const;

export function Landing({
  signIn,
  signUp,
  demo,
}: {
  signIn: () => void;
  signUp: () => void;
  demo: () => void;
}) {
  const [navVisible, setNavVisible] = useState(false);
  const [heroVerbIndex, setHeroVerbIndex] = useState(0);

  const heroVerb = heroVerbs[heroVerbIndex];

  /* =========================================
     HERO VERB ANIMATION
  ========================================= */

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    if (reduceMotion.matches) return;

    const interval = window.setInterval(() => {
      setHeroVerbIndex(
        (index) => (index + 1) % heroVerbs.length
      );
    }, 2200);

    return () => window.clearInterval(interval);
  }, []);

  /* =========================================
     SMART NAV
  ========================================= */

  useEffect(() => {
    let pointerNearTop = false;

    const updateNav = () => {
      setNavVisible(
        window.scrollY > 180 || pointerNearTop
      );
    };

    const handlePointerMove = (
      event: PointerEvent
    ) => {
      pointerNearTop = event.clientY <= 84;
      updateNav();
    };

    const handleScroll = () => {
      updateNav();
    };

    window.addEventListener(
      "pointermove",
      handlePointerMove,
      { passive: true }
    );

    window.addEventListener(
      "scroll",
      handleScroll,
      { passive: true }
    );

    return () => {
      window.removeEventListener(
        "pointermove",
        handlePointerMove
      );

      window.removeEventListener(
        "scroll",
        handleScroll
      );
    };
  }, []);

  return (
    <main className="landing landing-v2">

      {/* =====================================
          NAVIGATION
      ====================================== */}

      <nav
        className={`landing-nav smart-nav ${
          navVisible ? "is-visible" : ""
        }`}
        onFocusCapture={() => setNavVisible(true)}
      >
        <Logo />

        <div className="nav-actions">
          <Button
            variant="ghost"
            onClick={signIn}
          >
            Open workspace
          </Button>

          <Button
            variant="outline"
            onClick={signUp}
          >
            Set up profile
          </Button>
        </div>
      </nav>


      {/* =====================================
          HERO
      ====================================== */}

      <section className="hero hero-v2">

        {/* SYSTEM ARCHITECTURE BACKGROUND */}

        <div
          className="hero-system"
          aria-hidden="true"
        >
          <div className="system-grid" />

          <svg
            className="system-wires"
            viewBox="0 0 1000 720"
            preserveAspectRatio="none"
          >
            {/* Base connections */}

            <g className="wire-base">
              <path d="M120 335 C145 335 150 225 175 225" />
              <path d="M120 335 H330" />
              <path d="M295 225 C320 225 310 335 330 335" />

              <path d="M450 335 C475 335 485 155 520 155" />
              <path d="M450 335 H520" />
              <path d="M450 335 C475 335 485 515 520 515" />

              <path d="M640 155 H720" />
              <path d="M640 335 H720" />
              <path d="M640 515 H720" />

              <path d="M780 190 V500" />
              <path d="M780 370 V500" />

              <path d="M840 535 H890" />

              <path d="M640 335 C735 335 785 285 875 285" />
            </g>

            {/* Animated traffic */}

            <g className="wire-flow">
              <path d="M120 335 H330" />
              <path d="M450 335 H520" />
              <path d="M640 335 H720" />
              <path d="M640 335 C735 335 785 285 875 285" />
              <path d="M450 335 C475 335 485 515 520 515" />
            </g>
          </svg>


          {/* SYSTEM NODES */}

          <div className="system-node node-client" />
          <div className="system-node node-cdn" />
          <div className="system-node node-lb" />

          <div className="system-node node-api-a" />
          <div className="system-node node-api-b" />
          <div className="system-node node-api-c" />

          <div className="system-node node-queue" />
          <div className="system-node node-cache" />

          <div className="system-node node-db" />
          <div className="system-node node-storage" />

          <div className="system-node node-external" />

          {/* Transient animated nodes */}

          <div className="system-node transient-node transient-node-a" />
          <div className="system-node transient-node transient-node-b" />
          <div className="system-node transient-node transient-node-c" />
          <div className="system-node transient-node transient-node-d" />
        </div>


        {/* ===================================
            HERO MESSAGE
        ==================================== */}

        <div className="hero-copy hero-copy-v2 hero-copy-centered">

          <div className="hero-brand-lockup">
            <span>
              THINK LIKE AN
            </span>

            <Logo
              className="hero-logo"
              tabIndex={-1}
            />
          </div>


          {/* Animated:
              Build systems.
              Break systems.
              Understand systems.
              etc.
          */}

          <h1
            className="hero-system-line"
            aria-label="Build, break, understand, stress, scale, and fix systems."
          >
            <span
              className="hero-verb-slot"
              aria-hidden="true"
            >
              <span
                key={heroVerb.label}
                className={`hero-verb hero-verb-${heroVerb.motion}`}
              >
                {heroVerb.label}
              </span>
            </span>

            <span
              className="hero-system-word"
              aria-hidden="true"
            >
              systems.
            </span>
          </h1>


          {/* HERO ACTIONS */}

          <div className="hero-actions">

            <Button onClick={signUp}>
              Start building
              <Icon name="arrow" />
            </Button>

            <Button
              variant="ghost"
              onClick={demo}
            >
              Explore a system
              <Icon name="arrow" />
            </Button>

          </div>
        </div>


        {/* ===================================
            SCROLL INTO STORY
        ==================================== */}

        <a
          href="#system-story"
          className="hero-explore"
          aria-label="Explore ARCHITECT"
        >
          <span>EXPLORE</span>

          <span
            className="hero-explore-arrow"
            aria-hidden="true"
          >
            ↓
          </span>
        </a>

      </section>


      {/* =====================================
          INTERACTIVE PRODUCT STORY

          01 BUILD
          02 BREAK
          03 SOLVE
          04 LEARN
          05 CHALLENGE
      ====================================== */}

      <SystemStory />

    </main>
  );
}