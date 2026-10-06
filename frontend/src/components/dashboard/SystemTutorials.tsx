type NodeKind = "box" | "circle";
type TopologyNode = { x: number; y: number; kind: NodeKind };
type TopologyEdge = {
  from: number;
  to: number;
  /** Request path that darkens on hover. */
  primary?: boolean;
};

type Tutorial = {
  id: string;
  company: string;
  title: string;
  topic: string;
  nodes: readonly TopologyNode[];
  edges: readonly TopologyEdge[];
};

const box = (x: number, y: number): TopologyNode => ({ x, y, kind: "box" });
const circle = (x: number, y: number): TopologyNode => ({ x, y, kind: "circle" });

// Abstract topologies in a 300x100 viewBox. Illustrative, not exact vendor architecture.
const TUTORIALS: readonly Tutorial[] = [
  {
    id: "netflix",
    company: "Netflix",
    title: "How Netflix Streams at Scale",
    topic: "Video Delivery",
    nodes: [
      circle(20, 20), circle(20, 50), circle(20, 80),
      box(90, 20), box(90, 50), box(90, 80),
      box(170, 50),
      box(240, 30), box(240, 70),
    ],
    edges: [
      { from: 0, to: 3, primary: true },
      { from: 1, to: 4 },
      { from: 2, to: 5 },
      { from: 3, to: 6, primary: true },
      { from: 4, to: 6 },
      { from: 5, to: 6 },
      { from: 6, to: 7, primary: true },
      { from: 6, to: 8 },
    ],
  },
  {
    id: "uber",
    company: "Uber",
    title: "How Uber Matches Riders",
    topic: "Real-Time Systems",
    nodes: [
      circle(20, 25), circle(20, 75),
      box(95, 50),
      box(165, 25), box(165, 75),
      circle(250, 20), circle(250, 50), circle(250, 80),
    ],
    edges: [
      { from: 0, to: 2, primary: true },
      { from: 1, to: 2 },
      { from: 2, to: 3, primary: true },
      { from: 2, to: 4 },
      { from: 3, to: 5, primary: true },
      { from: 3, to: 6 },
      { from: 4, to: 6 },
      { from: 4, to: 7 },
    ],
  },
  {
    id: "youtube",
    company: "YouTube",
    title: "How YouTube Delivers Video",
    topic: "Video Infrastructure",
    nodes: [
      circle(20, 50),
      box(70, 50),
      box(125, 25), box(125, 75),
      box(185, 50),
      box(240, 25), box(240, 75),
    ],
    edges: [
      { from: 0, to: 1, primary: true },
      { from: 1, to: 2, primary: true },
      { from: 1, to: 3 },
      { from: 2, to: 4, primary: true },
      { from: 3, to: 4 },
      { from: 4, to: 5, primary: true },
      { from: 4, to: 6 },
    ],
  },
];

function SystemDiagram({ nodes, edges }: Pick<Tutorial, "nodes" | "edges">) {
  return (
    <svg
      viewBox="0 0 300 100"
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      aria-hidden="true"
    >
      {edges.map(({ from, to, primary }) => (
        <line
          key={`${from}-${to}`}
          x1={nodes[from].x}
          y1={nodes[from].y}
          x2={nodes[to].x}
          y2={nodes[to].y}
          stroke="currentColor"
          strokeWidth="0.75"
          opacity={primary ? 1 : 0.45}
        />
      ))}
      {nodes.map(({ x, y, kind }, index) =>
        kind === "circle" ? (
          <circle
            key={index}
            cx={x}
            cy={y}
            r="5"
            fill="var(--tile)"
            stroke="currentColor"
            strokeWidth="0.75"
          />
        ) : (
          <rect
            key={index}
            x={x - 9}
            y={y - 6}
            width="18"
            height="12"
            rx="2"
            fill="var(--tile)"
            stroke="currentColor"
            strokeWidth="0.75"
          />
        ),
      )}
    </svg>
  );
}

export default function SystemTutorials() {
  return (
    <section className="shrink-0 bg-[#F2F2EF] px-8 pb-[clamp(0.75rem,2.5vh,1.75rem)] pt-[clamp(0.75rem,2.5vh,1.5rem)] lg:px-14">
      <div className="mb-[clamp(0.5rem,1.5vh,1rem)] flex items-baseline justify-between">
        <h2 data-reveal="fade" className="text-lg font-light tracking-[-0.02em]">
          System breakdowns
        </h2>
        <button
          type="button"
          className="group text-xs text-blue-700 focus-visible:underline focus-visible:outline-none"
        >
          Explore all{" "}
          <span
            className="inline-block transition-transform duration-200 group-hover:translate-x-1 motion-reduce:transition-none"
            aria-hidden="true"
          >
            →
          </span>
        </button>
      </div>

      <ul className="grid grid-cols-1 border-y border-neutral-300 lg:grid-cols-3 lg:divide-x lg:divide-neutral-300">
        {TUTORIALS.map((tutorial, index) => (
          <li
            key={tutorial.id}
            className="max-lg:border-b max-lg:border-neutral-300 max-lg:last:border-b-0"
          >
            <button
              type="button"
              className="group grid h-[clamp(4.5rem,12vh,7rem)] w-full grid-cols-[auto_1fr_7rem] items-center gap-x-4 bg-[#F2F2EF] px-4 text-left text-neutral-400 transition-colors duration-200 [--tile:#F2F2EF] hover:bg-[#0A0A0A] hover:text-neutral-500 hover:[--tile:#0A0A0A] focus-visible:bg-[#0A0A0A] focus-visible:outline-none focus-visible:[--tile:#0A0A0A] motion-reduce:transition-none"
            >
              <span className="text-2xl font-light leading-none tracking-[-0.05em] tabular-nums text-neutral-400 transition-colors duration-200 group-hover:text-blue-500 motion-reduce:transition-none">
                {String(index + 1).padStart(2, "0")}
              </span>

              <span className="min-w-0">
                <span className="block truncate text-[11px] text-neutral-500 group-hover:text-neutral-400">
                  {tutorial.company} · {tutorial.topic}
                </span>
                <span className="mt-0.5 block truncate text-base font-light tracking-[-0.01em] text-[#0A0A0A] transition-colors duration-200 group-hover:text-white motion-reduce:transition-none">
                  {tutorial.title}
                </span>
              </span>

              <span className="h-10">
                <SystemDiagram nodes={tutorial.nodes} edges={tutorial.edges} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
