import { useEffect, useState } from "react";

import { Dialog, Icon, IconButton, PanelHeader } from "../../components/ui";

export function DemoPickerModal({ close, demo }: { close: () => void; demo: () => void }) {
  const companies: [string, string, string, string][] = [
    ["Netflix", "How Netflix Streams Video", "Video streaming at 200M+ subscribers", "netflix"],
    ["Uber", "How Uber Routes Rides", "Realtime dispatch at global scale", "uber"],
    ["Google", "How Google Search Works", "Search indexing across the web", "google"],
  ];
  return (
    <Dialog label="Choose a demo" onDismiss={close} scrimClassName="modal-scrim" className="new-project-modal">
        <PanelHeader className="panel-title" eyebrow="EXPLORE DEMO" title="Open a system">
          <IconButton icon="close" label="Close demo picker" tooltip="Close" size="sm" onClick={close} />
        </PanelHeader>
        <p className="npm-desc">Inspect the topology, change the load, and run a test.</p>
        <div className="demo-company-grid">
          {companies.map(([name, title, sub, cls]) => (
            <button key={name} className={`tutorial-visual ${cls} demo-company-btn`} onClick={demo}>
              <strong>{name}</strong>
              <b className="demo-company-title">{title}</b>
              <span>{sub}</span>
            </button>
          ))}
        </div>
    </Dialog>
  );
}



export function DemoReel({ mode }: { mode: "learn" | "challenge" }) {
  const [step, setStep] = useState(0);
  const steps = 4;
  useEffect(() => {
    setStep(0);
    const t = setInterval(() => setStep(s => (s + 1) % steps), 2800);
    return () => clearInterval(t);
  }, [mode]);

  const learnNodes = [
    { label: "Smart TV", sub: "1.2k req/s", tone: "purple", x: 8, y: 105 },
    { label: "Load Balancer", sub: "42ms p95", tone: "yellow", x: 160, y: 40 },
    { label: "Playback Svc", sub: "3 instances", tone: "pink", x: 305, y: 30 },
    { label: "CDN Edge", sub: "8.4ms", tone: "blue", x: 305, y: 148 },
  ];
  const challengeNodes = [
    { label: "Web Client", sub: "10k req/s", tone: "purple", x: 8, y: 105 },
    { label: "API Gateway", sub: "85ms p95", tone: "purple", x: 160, y: 40 },
    { label: "Redirect Svc", sub: "3 replicas", tone: "purple", x: 305, y: 30 },
    { label: "Redis Cache", sub: "4ms", tone: "purple", x: 305, y: 148 },
  ];
  const nodes = mode === "learn" ? learnNodes : challengeNodes;
  const NW = 130, NH = 54;
  const edges: [number, number][] = [[0, 1], [1, 2], [1, 3]];

  const aiTexts = [
    "The Load Balancer distributes requests so no single service is overwhelmed.",
    "CDN Edge serves cached content from the nearest geographic point.",
  ];
  const reqLabels = ["Throughput: 10k/s", "Latency: < 100ms", "Availability: 99.99%", "Budget: < $800/mo"];
  const reqMet = [step >= 3, step >= 3, false, true];

  return (
    <div className="mini-canvas demo-reel-canvas">
      <div className="demo-rec"><span />REC</div>
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", pointerEvents: "none" }}>
        {edges.map(([f, t]) => {
          const fn = nodes[f], tn = nodes[t];
          const fx = fn.x + NW, fy = fn.y + NH / 2;
          const tx = tn.x, ty = tn.y + NH / 2;
          const mx = (fx + tx) / 2;
          return <path key={`${f}-${t}`} fill="none" stroke={step === 3 && mode === "challenge" ? "#111111" : "#8a8a84"} strokeWidth="1.5" strokeDasharray={step === 3 && mode === "challenge" ? "none" : "none"} d={`M${fx} ${fy} C${mx} ${fy} ${mx} ${ty} ${tx} ${ty}`} />;
        })}
      </svg>
      {nodes.map((n, i) => (
        <div key={i} className={`canvas-node demo-reel-node ${step === 1 && i === 1 ? "demo-selected" : ""} ${step === 3 ? "run-active" : ""}`} style={{ position: "absolute", left: n.x, top: n.y }}>
          <span className={`node-symbol ${n.tone}`}><Icon name="bolt" size={13} /></span>
          <span><b>{n.label}</b><small>{n.sub}</small></span>
        </div>
      ))}
      {mode === "learn" && step >= 1 && (
        <div className="demo-popover" style={{ opacity: step >= 1 ? 1 : 0 }}>
          <b>{step >= 2 ? "Inspection" : "Load Balancer"}</b>
          {step >= 2 ? <p>{aiTexts[0]}</p> : <><span>Inspect component</span><span>Configure</span></>}
        </div>
      )}
      {mode === "challenge" && step >= 1 && (
        <div className="demo-reqs" style={{ opacity: step >= 1 ? 1 : 0 }}>
          {reqLabels.map((label, i) => (
            <div key={label} className={`demo-req ${reqMet[i] ? "met" : ""}`}>
              {reqMet[i] ? <Icon name="check" size={9} /> : <Icon name="bolt" size={9} />}
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
      <div className="reel-progress">
        {Array.from({ length: steps }).map((_, i) => <span key={i} className={i === step ? "active" : ""} />)}
      </div>
    </div>
  );
}

