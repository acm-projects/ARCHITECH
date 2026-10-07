import StartChallengeButton from "./StartChallengeButton";

type DailyChallengeProps = {
  title: string;
  difficulty: "Easy" | "Intermediate" | "Hard";
  requirement: string;
};

// Request path drawn in the hero: Client -> Load Balancer -> API Servers -> Cache / DB.
const NODES = [
  { id: "client", label: "Client", x: 40, y: 180 },
  { id: "lb", label: "Load Balancer", x: 190, y: 180 },
  { id: "api1", label: "API Server", x: 350, y: 100 },
  { id: "api2", label: "API Server", x: 350, y: 260 },
  { id: "cache", label: "Cache", x: 520, y: 100 },
  { id: "db", label: "Database", x: 520, y: 260 },
] as const;

const EDGES: readonly [string, string][] = [
  ["client", "lb"],
  ["lb", "api1"],
  ["lb", "api2"],
  ["api1", "cache"],
  ["api2", "db"],
  ["api1", "db"],
];

// The highlighted request: Client -> Load Balancer -> API Server -> Cache.
const TRAVEL = ["client", "lb", "api1", "cache"];

const NODE_W = 78;
const NODE_H = 26;

const nodeById = (id: string) => NODES.find((node) => node.id === id)!;

function HeroDiagram() {
  return (
    <svg
      viewBox="0 0 600 340"
      preserveAspectRatio="xMaxYMid meet"
      className="h-full w-full"
      aria-hidden="true"
      fill="none"
    >
      {EDGES.map(([from, to]) => {
        const a = nodeById(from);
        const b = nodeById(to);
        return (
          <line
            key={`${from}-${to}`}
            data-edge
            x1={a.x + NODE_W / 2}
            y1={a.y}
            x2={b.x - NODE_W / 2}
            y2={b.y}
            stroke="#5c5c5c"
            strokeWidth="1"
          />
        );
      })}

      {NODES.map((node) => (
        <g key={node.id} data-node>
          <rect
            x={node.x - NODE_W / 2}
            y={node.y - NODE_H / 2}
            width={NODE_W}
            height={NODE_H}
            rx="5"
            fill="#0A0A0A"
            stroke="#5c5c5c"
          />
          <text
            x={node.x}
            y={node.y + 3}
            textAnchor="middle"
            fontSize="9"
            fill="#d4d4d4"
          >
            {node.label}
          </text>
        </g>
      ))}

      {TRAVEL.map((id) => {
        const node = nodeById(id);
        return (
          <circle
            key={id}
            data-path
            data-x={node.x}
            data-y={node.y}
            r="0"
            cx={node.x}
            cy={node.y}
          />
        );
      })}
      <circle data-dot r="3.5" fill="#2563eb" />
    </svg>
  );
}

export default function DailyChallenge({
  title,
  difficulty,
  requirement,
}: DailyChallengeProps) {
  // Two lines of display type; each line is revealed from behind a mask.
  const words = title.split(" ");
  const split = Math.ceil(words.length / 2);
  const lines = [words.slice(0, split).join(" "), words.slice(split).join(" ")];

  return (
    <section className="relative min-h-0 flex-1 overflow-hidden bg-[#0A0A0A] text-white max-lg:min-h-[75dvh]">
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[50%] items-center md:flex">
        <HeroDiagram />
      </div>

      <div className="relative flex h-full flex-col justify-between px-8 py-6 lg:px-14 lg:py-[clamp(1rem,3.5vh,2.5rem)]">
        <div
          data-reveal="fade"
          className="flex items-center gap-4 text-xs text-neutral-400"
        >
          <span>Daily challenge</span>
          <span className="h-px w-8 bg-neutral-700" aria-hidden="true" />
          <span>{difficulty}</span>
        </div>

        <div>
          <h1 className="text-[clamp(2.25rem,min(6vw,12.5vh),7.5rem)] font-light leading-[0.95] tracking-[-0.045em]">
            {lines.map((line) => (
              <span key={line} className="block overflow-hidden pb-[0.08em]">
                <span data-reveal="line" className="block">
                  {line}
                </span>
              </span>
            ))}
          </h1>

          <div className="mt-[clamp(0.75rem,3vh,2rem)] flex flex-col items-start gap-4">
            <div data-reveal="fade">
              <StartChallengeButton title={title} />
            </div>

            <p data-reveal="fade" className="text-sm text-neutral-400">
              {requirement}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
