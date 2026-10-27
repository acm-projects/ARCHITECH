/* The three Archies on the experience screen.
   The component draws them; the hook makes their eyes follow the mouse.
*/

// Load whichever Archie belongs to this card.
import Image from "next/image";
// Set up tracking and use the ref to find the eyes on the page.
import { useEffect, type RefObject } from "react";

// The eyes are in the same spot in all three SVGs.
const EYES = [
  { x: 487, y: 627 },
  { x: 759, y: 625 },
] as const;
const MAX_EYE_MOVEMENT = 22; // how far the pupils can move, in SVG units
const TRACKING_DISTANCE = 180; // how far the mouse needs to be for the full movement

/* Auth.tsx picks the SVG for each level.
   The pupils live here so we can move them without moving the whole drawing.
*/
export function OnboardingArchie({ src }: { src: string }) {
  return (
    <span className="onboarding-option-media" aria-hidden="true">
      <Image
        src={src}
        alt=""
        fill
        sizes="(max-width: 700px) 64px, (max-width: 1064px) 30vw, 270px"
      />
      <svg className="onboarding-eyes" viewBox="125 100 1000 1020">
        {EYES.map(({ x, y }) => (
          <ellipse key={x} data-pupil cx={x} cy={y} rx="37" ry="40" fill="#000" />
        ))}
      </svg>
    </span>
  );
}

/* container is the ref to the three experience cards.
   Only track while that step is open.
*/
export function useArchieEyes(
  container: RefObject<HTMLFieldSetElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || !container.current) return;

    // Grab the eyes once instead of looking them up every time the mouse moves.
    const drawings = Array.from(container.current.querySelectorAll<SVGSVGElement>(".onboarding-eyes"), svg => ({
      svg,
      pupils: Array.from(svg.querySelectorAll<SVGEllipseElement>("[data-pupil]")),
    }));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0; // 0 means there's no update waiting
    let mouse: { x: number; y: number } | null = null;

    // Look straight ahead again and cancel any update that's still waiting.
    const resetEyes = () => {
      cancelAnimationFrame(frameId);
      frameId = 0;
      mouse = null;
      for (const { pupils } of drawings) {
        for (const pupil of pupils) {
          pupil.removeAttribute("transform");
        }
      }
    };

    const updateEyes = () => {
      frameId = 0;
      if (!mouse) return;

      for (const { svg, pupils } of drawings) {
        const matrix = svg.getScreenCTM();
        if (!matrix) continue;
        // Match the mouse position to the SVG's scale, even on smaller cards (thank you chatgpt).
        const point = new DOMPoint(mouse.x, mouse.y).matrixTransform(matrix.inverse());
        for (const pupil of pupils) {
          const dx = point.x - pupil.cx.baseVal.value;
          const dy = point.y - pupil.cy.baseVal.value;
          // Follow the mouse, but keep the pupils inside the glasses.
          const scale = MAX_EYE_MOVEMENT / Math.max(TRACKING_DISTANCE, Math.hypot(dx, dy));
          pupil.setAttribute("transform", `translate(${dx * scale} ${dy * scale})`);
        }
      }
    };

    const followMouse = (event: PointerEvent) => {
      // Leave the eyes still for touch input or reduced motion.
      if (event.pointerType !== "mouse" || reducedMotion.matches) return;
      mouse = { x: event.clientX, y: event.clientY };
      // Wait for the next frame instead of drawing on every mouse event.
      if (!frameId) frameId = requestAnimationFrame(updateEyes);
    };

    const leaveWindow = (event: PointerEvent) => {
      // Reset when the mouse leaves the page, not when it moves between cards.
      if (!event.relatedTarget) resetEyes();
    };

    // They should follow the mouse anywhere on this screen.
    window.addEventListener("pointermove", followMouse, { passive: true });
    window.addEventListener("pointerout", leaveWindow);
    window.addEventListener("blur", resetEyes);
    reducedMotion.addEventListener("change", resetEyes);
    return () => {
      // Clean up when we leave this step.
      window.removeEventListener("pointermove", followMouse);
      window.removeEventListener("pointerout", leaveWindow);
      window.removeEventListener("blur", resetEyes);
      reducedMotion.removeEventListener("change", resetEyes);
      resetEyes();
    };
  }, [container, enabled]);
}
