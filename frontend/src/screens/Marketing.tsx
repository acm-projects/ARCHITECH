import { Nunito } from "next/font/google"
import { useEffect, useState } from "react"

import { Button, Icon, Logo } from "../components/ui"
import SystemStory from "./SystemStory/SystemStory"

const heroVerbs = ["Build", "Break", "Understand"] as const
const nunito = Nunito({ subsets: ["latin"], weight: "400", display: "swap" })

export function Landing({
  signIn,
  signUp,
  demo,
}: {
  signIn: () => void
  signUp: () => void
  demo: () => void
}) {
  const [navVisible, setNavVisible] = useState(false)
  const [heroVerbIndex, setHeroVerbIndex] = useState(0)

  const heroVerb = heroVerbs[heroVerbIndex]

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

    let interval: number | undefined
    const updateMotion = () => {
      window.clearInterval(interval)
      if (reduceMotion.matches) {
        setHeroVerbIndex(0)
        return
      }
      interval = window.setInterval(() => {
        setHeroVerbIndex((index) => (index + 1) % heroVerbs.length)
      }, 2400)
    }
    updateMotion()
    reduceMotion.addEventListener("change", updateMotion)
    return () => {
      window.clearInterval(interval)
      reduceMotion.removeEventListener("change", updateMotion)
    }
  }, [])

  useEffect(() => {
    let pointerNearTop = false

    const updateNav = () => {
      setNavVisible(window.scrollY > 180 || pointerNearTop)
    }

    const handlePointerMove = (event: PointerEvent) => {
      pointerNearTop = event.clientY <= 84
      updateNav()
    }

    const handleScroll = () => {
      updateNav()
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: true })

    window.addEventListener("scroll", handleScroll, { passive: true })

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)

      window.removeEventListener("scroll", handleScroll)
    }
  }, [])

  return (
    <main className="landing landing-v2">

      <nav
        className={`page-header landing-nav smart-nav ${navVisible ? "is-visible" : ""}`}
        onFocusCapture={() => setNavVisible(true)}
      >
        <div className="logo"><Logo /></div>

        <div className="nav-actions">
          <Button variant="ghost" onClick={signIn}>
            Open workspace
          </Button>

          <Button variant="outline" onClick={signUp}>
            Set up profile
          </Button>
        </div>
      </nav>

      <section className="landing-intro" data-verb={heroVerb} aria-labelledby="landing-intro-title">
        <div className="landing-intro-copy">
          <h1
            id="landing-intro-title"
            className="landing-intro-title"
            aria-label="Build, break, understand systems."
          >
            <span className="landing-intro-verb-slot" aria-hidden="true">
              <span key={heroVerb} className="landing-intro-verb" data-verb={heroVerb}>
                {heroVerb}
              </span>
            </span>
            <span className="landing-intro-system" aria-hidden="true">
              systems.
            </span>
          </h1>
          <p className={`landing-intro-description ${nunito.className}`}>
            Think like an architect.
          </p>
          <div className="landing-intro-actions">
            <Button onClick={signUp}>
              Start building <Icon name="arrow" />
            </Button>
            <Button variant="ghost" onClick={demo}>
              Explore a system <Icon name="arrow" />
            </Button>
          </div>
        </div>
      </section>


      {/* =====================================
          INTERACTIVE PRODUCT STORY

          01 BUILD
          02 BREAK
          03 SOLVE
          04 LEARN
          05 CHALLENGE
      ====================================== */}

      <SystemStory onGetStarted={signUp} />

    </main>
  )
}
