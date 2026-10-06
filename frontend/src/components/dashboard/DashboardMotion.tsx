"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, type ReactNode } from "react";

gsap.registerPlugin(useGSAP);

// Orchestrates the dashboard's entrance. Motion here shows the system coming up: the
// hero title is set line by line, the diagram is drawn edge by edge, and a request
// travels the path. Everything is skipped when the user prefers reduced motion.
export default function DashboardMotion({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const entrance = gsap.timeline({ defaults: { ease: "expo.out" } });
        entrance
          .from("[data-reveal='line']", {
            yPercent: 110,
            duration: 1,
            stagger: 0.09,
          })
          .from(
            "[data-reveal='fade']",
            { autoAlpha: 0, y: 14, duration: 0.7, stagger: 0.07 },
            "-=0.6",
          );

        // Draw the hero diagram's edges, then fade its nodes in.
        const edges = gsap.utils.toArray<SVGGeometryElement>("[data-edge]");
        edges.forEach((edge) => {
          const length = edge.getTotalLength();
          gsap.set(edge, { strokeDasharray: length, strokeDashoffset: length });
        });
        gsap.to(edges, {
          strokeDashoffset: 0,
          duration: 1.3,
          ease: "power2.inOut",
          stagger: 0.1,
          delay: 0.35,
        });
        gsap.from("[data-node]", {
          autoAlpha: 0,
          duration: 0.6,
          stagger: 0.07,
          delay: 0.5,
        });

        // A request travels Client -> Load Balancer -> API -> Cache, then repeats.
        const dot = root.current?.querySelector<SVGCircleElement>("[data-dot]");
        const path = gsap.utils
          .toArray<SVGElement>("[data-path]")
          .map((point) => ({
            x: Number(point.dataset.x),
            y: Number(point.dataset.y),
          }));
        if (dot && path.length > 1) {
          gsap.set(dot, { attr: { cx: path[0].x, cy: path[0].y }, autoAlpha: 0 });
          const travel = gsap.timeline({ repeat: -1, repeatDelay: 0.6, delay: 1.8 });
          travel.to(dot, { autoAlpha: 1, duration: 0.2 });
          path.slice(1).forEach((point) => {
            travel.to(dot, {
              attr: { cx: point.x, cy: point.y },
              duration: 0.9,
              ease: "power1.inOut",
            });
          });
          travel.to(dot, { autoAlpha: 0, duration: 0.25 });
        }

        // The start button leans slightly toward the pointer.
        const cleanups = gsap.utils
          .toArray<HTMLElement>("[data-magnetic]")
          .map((el) => {
            const x = gsap.quickTo(el, "x", { duration: 0.5, ease: "power3.out" });
            const y = gsap.quickTo(el, "y", { duration: 0.5, ease: "power3.out" });
            const onMove = (event: PointerEvent) => {
              const box = el.getBoundingClientRect();
              x((event.clientX - (box.left + box.width / 2)) * 0.25);
              y((event.clientY - (box.top + box.height / 2)) * 0.25);
            };
            const onLeave = () => {
              x(0);
              y(0);
            };
            el.addEventListener("pointermove", onMove);
            el.addEventListener("pointerleave", onLeave);
            return () => {
              el.removeEventListener("pointermove", onMove);
              el.removeEventListener("pointerleave", onLeave);
            };
          });

        return () => cleanups.forEach((cleanup) => cleanup());
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
