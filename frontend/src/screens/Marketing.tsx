import { useEffect, useState } from "react"

import { Button, Icon, Logo } from "../components/ui"
import SystemStory from "./SystemStory/SystemStory"
import { ArchieHero } from "../components/marketing/archie-hero/ArchieHero"

export function Landing({
  signUp,
  demo,
}: {
  signIn: () => void
  signUp: () => void
  demo: () => void
}) {
  const [navVisible, setNavVisible] = useState(false)

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

  const actions = (
    <>
      <Button onClick={signUp}>
        Start building <Icon name="arrow" />
      </Button>
      <Button variant="ghost" onClick={demo}>
        Explore a system <Icon name="arrow" />
      </Button>
    </>
  )

  return (
    <main className="landing landing-v2">

      <nav
        className={`page-header landing-nav smart-nav ${navVisible ? "is-visible" : ""}`}
        onFocusCapture={() => setNavVisible(true)}
      >
        <div className="logo"><Logo /></div>

        <div className="nav-actions">
          {actions}
        </div>
      </nav>

      <ArchieHero actions={actions} />

      <SystemStory onGetStarted={signUp} />

    </main>
  )
}
