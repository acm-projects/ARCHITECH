"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Cloud, Code2, Database, Monitor } from "lucide-react";
import { Logo } from "../ui";
import AuthArchie from "./AuthArchie";

gsap.registerPlugin(useGSAP);

const NODES = [
  { id: "code", label: "Code", Icon: Code2 },
  { id: "database", label: "Database", Icon: Database },
  { id: "cloud", label: "Cloud", Icon: Cloud },
  { id: "frontend", label: "Frontend", Icon: Monitor },
] as const;
const CONNECTIONS = [
  { from: "code", to: "cloud", path: "M110 100 C110 10 370 10 370 100" },
  { from: "code", to: "frontend", path: "M110 100 C20 110 20 275 100 300" },
  { from: "cloud", to: "database", path: "M370 100 C460 110 460 275 380 300" },
  { from: "frontend", to: "database", path: "M100 300 C170 395 310 395 380 300" },
] as const;

export default function AuthIntroduction({ onBack }: { onBack: () => void }) {
  const scope = useRef<HTMLElement>(null);
  const loops = useRef<gsap.core.Animation[]>([]);
  const [paused, setPaused] = useState(false);

  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const root = scope.current;
      if (!root) return;
      const paths = Array.from(root.querySelectorAll<SVGPathElement>("[data-connection]"));
      const packets = root.querySelectorAll<SVGCircleElement>("[data-packet]");
      const intro = gsap.timeline({ defaults: { ease: "power2.out" } });
      intro.from(".auth-intro-copy", { y: 16, opacity: 0, duration: 0.6 })
        .from(".auth-intro-archie", { y: 65, opacity: 0, duration: 1, ease: "back.out(1.4)" }, 0.2)
        .from(".auth-intro-node", { scale: 0.7, opacity: 0, duration: 0.45, stagger: 0.14 }, 0.5);
      paths.forEach(path => {
        const length = path.getTotalLength();
        intro.fromTo(path, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 0.8 }, 1.05);
      });
      loops.current = [
        gsap.to(".auth-intro-archie", { y: -7, duration: 2.7, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 1.6 }),
        gsap.timeline({ repeat: -1, repeatDelay: 4.8, delay: 2.5 }).to("[data-archie-eyes]", { scaleY: 0.08, transformOrigin: "50% 50%", duration: 0.1 }).to("[data-archie-eyes]", { scaleY: 1, duration: 0.12 }),
      ];
      root.querySelectorAll<HTMLElement>(".auth-intro-node").forEach((node, index) => {
        loops.current.push(gsap.to(node, { y: index % 2 ? 6 : -6, duration: 2.5 + index * 0.4, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 1.6 + index * 0.15 }));
      });
      paths.forEach((path, index) => {
        const packet = packets[index];
        const length = path.getTotalLength();
        const progress = { value: 0 };
        loops.current.push(gsap.to(progress, {
          value: 1, duration: 3.8 + index * 0.4, repeat: -1, ease: "none", delay: 1.9 + index * 0.35,
          onStart: () => { packet.style.opacity = "1"; },
          onUpdate: () => {
            const point = path.getPointAtLength(progress.value * length);
            packet.setAttribute("cx", String(point.x));
            packet.setAttribute("cy", String(point.y));
          },
        }));
      });
      return () => { loops.current = []; };
    });
    return () => media.revert();
  }, { scope });

  return <aside className="auth-introduction" ref={scope} aria-label="Introduction to ARCHITECH">
    <Logo variant="with-archie" onClick={onBack} aria-label="Back to ARCHITECH home" className="auth-intro-brand" />
    <div className="auth-intro-copy">
      <h2>Your playground for <span>system design.</span></h2>
      <p>Plan, build, and test software systems with Archie.</p>
    </div>
    <div className="auth-intro-scene">
      <svg className="auth-intro-connections" viewBox="0 0 480 420" aria-hidden="true">
        {CONNECTIONS.map(link => <g key={link.from + link.to} data-from={link.from} data-to={link.to}>
          <path data-connection d={link.path} />
          <circle data-packet r="3" cx="0" cy="0" />
        </g>)}
      </svg>
      <div className="auth-intro-archie"><AuthArchie /></div>
      {NODES.map(({ id, label, Icon }) => <div key={id} className={`auth-intro-node auth-intro-node-${id}`} data-node={id}>
        <div className="auth-intro-node-face" tabIndex={0} role="img" aria-label={`${label} architecture node`}>
          <Icon size={25} aria-hidden="true" /><span>{label}</span>
        </div>
      </div>)}
    </div>
    <button type="button" className="auth-intro-pause" aria-pressed={paused} onClick={() => {
      loops.current.forEach(animation => animation.paused(!paused));
      setPaused(!paused);
    }}>{paused ? "Resume animation" : "Pause animation"}</button>
  </aside>;
}
