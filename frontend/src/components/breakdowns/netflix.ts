import type { ArchitectureNodeType } from "../../lib/architecture/types.ts";
import type { ArchitectureFlowNode } from "../workspace/nodes/ArchitectureNode";

export const NETFLIX_SOURCES = {
  delivery: {
    title: "Netflix · Open Connect overview",
    href: "https://openconnect.netflix.com/Open-Connect-Overview.pdf",
  },
  platform: {
    title: "Netflix · How streaming works with ISPs",
    href: "https://about.netflix.com/en/news/how-netflix-works-with-isps-around-the-globe-to-deliver-a-great-viewing-experience",
  },
  api: {
    title: "Netflix TechBlog · API architecture",
    href: "https://netflixtechblog.com/engineering-trade-offs-and-the-netflix-api-re-architecture-64f122b277dd",
  },
  cache: {
    title: "Netflix Open Source · EVCache",
    href: "https://netflix.github.io/EVCache/features/",
  },
  history: {
    title: "Netflix TechBlog · Viewing-history storage",
    href: "https://medium.com/netflix-techblog/scaling-time-series-data-storage-part-i-ec2b6d44ba39",
  },
  encoding: {
    title: "Netflix TechBlog · Video Encoding Service",
    href: "https://netflixtechblog.com/the-making-of-ves-the-cosmos-microservice-for-netflix-video-encoding-946b9b3cd300",
  },
  fill: {
    title: "Netflix Open Connect · File distribution",
    href: "https://openconnect.zendesk.com/hc/en-us/articles/360035618071-Fill-patterns",
  },
} as const;

type SourceId = keyof typeof NETFLIX_SOURCES;
export const NETFLIX_CHAPTERS = ["Browsing", "Playback", "Video preparation"] as const;

export const NETFLIX_NODE_SIZE = { width: 192, height: 56 } as const;

type NetflixComponent = {
  id: string;
  label: string;
  role: string;
  type: ArchitectureNodeType;
  chapter: typeof NETFLIX_CHAPTERS[number];
  position: { x: number; y: number };
  explanation: string;
  why: string;
  flow: string;
  tradeoff: string;
  sources: readonly SourceId[];
};

// Logical responsibilities, not a replica of Netflix's current deployment. Service
// boundaries and supporting data stores are grouped to keep the walkthrough legible.
export const NETFLIX_COMPONENTS = [
  {
    chapter: "Browsing",
    id: "viewer", label: "Viewer", role: "TV, browser or phone", type: "client",
    position: { x: 0, y: 200 },
    explanation: "This is the Netflix app on your TV, phone or browser. It asks the API what to show. When you press play, it downloads video from Open Connect.",
    why: "The app buffers video and picks a quality level the device and connection can handle.",
    flow: "The app sends browsing and playback requests to the API. It downloads video directly from Open Connect.",
    tradeoff: "Higher quality uses more bandwidth. If the connection slows down, the player needs to lower quality or wait for more video to load.",
    sources: ["delivery", "platform"],
  },
  {
    chapter: "Browsing",
    id: "gateway", label: "API edge", role: "Request routing", type: "api-gateway",
    position: { x: 240, y: 200 },
    explanation: "The app needs a way to reach the right service. The API edge receives its requests and routes them: browsing goes to discovery, pressing play goes to playback.",
    why: "The app does not need to know the address of every internal service.",
    flow: "Viewer → API edge → discovery or playback. The response travels back to the app.",
    tradeoff: "Many requests depend on this entry point. It needs multiple instances and timeouts so one failure does not block everything.",
    sources: ["api"],
  },
  {
    chapter: "Browsing",
    id: "discovery", label: "Discovery", role: "Catalogue & recommendations", type: "server",
    position: { x: 480, y: 40 },
    explanation: "Discovery builds the screens you browse: titles, artwork and recommendations. This box groups several services that work together to decide what appears on the page.",
    why: "Browsing and starting a video do different jobs. Keeping them separate lets each service change and scale on its own.",
    flow: "The API edge calls discovery. Discovery reads cached or stored data and returns the catalogue to the app.",
    tradeoff: "A page can depend on several services. Waiting for the slowest one can delay the whole screen; returning a partial page can be better.",
    sources: ["platform", "api"],
  },
  {
    chapter: "Browsing",
    id: "data", label: "Metadata & history", role: "Saved application data", type: "database",
    position: { x: 720, y: 160 },
    explanation: "The cache can forget things. Persistent storage keeps information such as title details and viewing history after a restart. This box stands for several data stores, not one Netflix database.",
    why: "Netflix needs to remember what you watched and where you stopped, including when you switch devices.",
    flow: "Discovery and playback read or update application data here. Video files are stored separately.",
    tradeoff: "Viewing history and catalogue data have different read and write patterns. They may need different databases and rules for keeping copies in sync.",
    sources: ["history", "api"],
  },
  {
    chapter: "Browsing",
    id: "cache", label: "EVCache", role: "Frequently read data", type: "cache",
    position: { x: 720, y: 40 },
    explanation: "Repeated database reads cost time. EVCache keeps values in memory so services can reuse them. Here we show a cache in front of stored data; Netflix uses EVCache for other workloads too.",
    why: "Fast reads keep pages responsive and reduce work for the database.",
    flow: "Discovery checks the cache first. If the value is missing, the service reads it from durable storage.",
    tradeoff: "A cached value can be out of date. Each kind of data needs rules for when to expire or refresh it.",
    sources: ["cache", "history"],
  },
  {
    chapter: "Playback",
    id: "playback", label: "Playback", role: "Playback setup", type: "server",
    position: { x: 480, y: 280 },
    explanation: "When you press play, playback checks that you can watch the title and chooses files your device supports. It then asks steering where those files are available.",
    why: "The system has to check permissions and prepare a stream before the player starts downloading video.",
    flow: "API edge → playback → steering. The app gets playback details and delivery URLs in the response.",
    tradeoff: "Every check adds time before the first frame. Slow dependencies need timeouts and clear error handling.",
    sources: ["delivery", "api"],
  },
  {
    chapter: "Playback",
    id: "steering", label: "Steering", role: "Select a video server", type: "server",
    position: { x: 720, y: 280 },
    explanation: "The player needs a server that has the right files and can reach it over a suitable network path. Steering chooses Open Connect appliances using availability and routing information.",
    why: "A nearby server is no use if it is down or does not have the requested video.",
    flow: "Playback asks for delivery URLs. Steering uses the appliance state collected by cache control to choose suitable locations.",
    tradeoff: "Old availability data can send a player to the wrong server. Alternate locations give it another place to try.",
    sources: ["delivery"],
  },
  {
    chapter: "Playback",
    id: "cdn", label: "Open Connect", role: "Video delivery · OCA", type: "cdn",
    position: { x: 480, y: 520 },
    explanation: "Open Connect sends the video to your device. Its appliances keep files close to viewers, including inside participating internet providers' networks. The video does not pass through the application API.",
    why: "Serving popular files locally reduces long-distance traffic and the bandwidth needed upstream.",
    flow: "After the app receives delivery URLs, it requests video from an appliance. The dashed arrow points back to the viewer because that is where the files go.",
    tradeoff: "Each appliance has limited storage and bandwidth. Netflix has to choose which files to put there and where to send traffic if it fails.",
    sources: ["delivery", "platform", "fill"],
  },
  {
    chapter: "Playback",
    id: "cache-control", label: "Cache control", role: "Appliance state · CCS", type: "server",
    position: { x: 720, y: 400 },
    explanation: "Steering needs to know which appliances are healthy and which files they hold. Cache control collects those reports from Open Connect. EVCache holds application data; cache control tracks video delivery appliances.",
    why: "Choosing a video server needs a recent picture of file availability and network reachability.",
    flow: "Appliances report health, routes and file inventory to cache control. Steering uses that collected state when it chooses delivery URLs.",
    tradeoff: "Reports can lag behind reality. A server can fail after its last report, so playback still needs other delivery locations to try.",
    sources: ["delivery"],
  },
  {
    chapter: "Video preparation",
    id: "assets", label: "Video assets", role: "Stored video files", type: "object-storage",
    position: { x: 240, y: 520 },
    explanation: "The prepared video files need somewhere to live before they reach Open Connect. This repository holds those files while content distribution copies them to delivery locations.",
    why: "Encoding workers can finish their jobs, and the same saved files can be distributed to many appliances.",
    flow: "Encoding writes the files. Distribution fills Open Connect from stored assets; intermediate storage locations are grouped together here.",
    tradeoff: "Files must be checked and versioned so delivery locations receive the right copy. A file should not be offered to a player before it is ready.",
    sources: ["platform", "encoding", "fill"],
  },

  {
    chapter: "Video preparation",
    id: "encoding", label: "Video encoding", role: "Prepare video formats", type: "worker",
    position: { x: 0, y: 520 },
    explanation: "A TV and a phone do not always need the same video file. Encoding creates versions with different formats, resolutions and quality levels before anyone starts watching.",
    why: "Preparing files ahead of time avoids making a viewer wait for expensive encoding work.",
    flow: "Source video → encoding workers → prepared video files. Upload and job scheduling are left out of this diagram.",
    tradeoff: "More versions take more compute time and storage. Failed jobs need retries, and the output needs checking before it is published.",
    sources: ["encoding"],
  },] as const satisfies readonly NetflixComponent[];

export type NetflixComponentId = typeof NETFLIX_COMPONENTS[number]["id"];

export type NetflixConnection = {
  id: string;
  source: NetflixComponentId;
  target: NetflixComponentId;
  label?: string;
  kind: "control" | "video";
  purpose: string;
};

export const NETFLIX_CONNECTIONS: readonly NetflixConnection[] = [
  { id: "viewer-api", source: "viewer", target: "gateway", kind: "control", purpose: "Application requests" },
  { id: "api-discovery", source: "gateway", target: "discovery", label: "browse", kind: "control", purpose: "Browse titles and recommendations" },
  { id: "api-playback", source: "gateway", target: "playback", label: "play", kind: "control", purpose: "Set up playback" },
  { id: "discovery-cache", source: "discovery", target: "cache", kind: "control", purpose: "Read frequently used values" },
  { id: "discovery-data", source: "discovery", target: "data", kind: "control", purpose: "Read stored application data" },
  { id: "playback-data", source: "playback", target: "data", kind: "control", purpose: "Read or update viewing state" },
  { id: "playback-steering", source: "playback", target: "steering", kind: "control", purpose: "Choose delivery URLs" },
  { id: "cdn-control", source: "cdn", target: "cache-control", label: "appliance reports", kind: "control", purpose: "Report health, routes and file inventory" },
  { id: "control-steering", source: "cache-control", target: "steering", kind: "control", purpose: "Supply appliance state for server selection" },
  { id: "cdn-viewer", source: "cdn", target: "viewer", label: "video segments", kind: "video", purpose: "Deliver requested video to the device" },
  { id: "encoding-assets", source: "encoding", target: "assets", label: "encoded files", kind: "video", purpose: "Store prepared video files" },
  { id: "assets-cdn", source: "assets", target: "cdn", label: "content fill", kind: "video", purpose: "Pre-position files before playback" },
];

export const NETFLIX_NODES: ArchitectureFlowNode[] = NETFLIX_COMPONENTS.map(component => ({
  id: component.id,
  type: "architecture",
  position: { ...component.position },
  data: { label: component.label, type: component.type },
}));

export const NETFLIX_STEPS = [...NETFLIX_COMPONENTS.map(component => component.id), "review"] as const;

// Keep focus and build progress separate: inspecting an earlier component must
// not remove later components. Both survive refresh without writing a project.
export function netflixStepIndex(step: string | null): number {
  const index = NETFLIX_STEPS.findIndex(id => id === step);
  return index < 0 ? 0 : index;
}

export type NetflixProgress = { stepIndex: number; revealedCount: number };
export type NetflixNavigation = number | "next" | "previous" | "restart";

export function netflixProgress(step: string | null, built: string | null): NetflixProgress {
  const stepIndex = netflixStepIndex(step);
  const builtIndex = NETFLIX_COMPONENTS.findIndex(component => component.id === built);
  const revealedCount = Math.min(NETFLIX_COMPONENTS.length, Math.max(stepIndex, builtIndex) + 1);
  return { stepIndex, revealedCount };
}

export function netflixScene(revealedCount: number) {
  const nodes = NETFLIX_NODES.slice(0, revealedCount);
  const ids = new Set(nodes.map(node => node.id));
  return { nodes, connections: NETFLIX_CONNECTIONS.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
}

export function netflixStepQuery(query: string, step: NetflixNavigation, reset = false): string {
  const params = new URLSearchParams(query);
  const previous = netflixProgress(params.get("step"), params.get("built"));
  const completed = previous.stepIndex === NETFLIX_COMPONENTS.length;
  const requested = typeof step === "number" ? step
    : step === "next" ? completed ? 0 : previous.revealedCount
    : step === "previous" ? previous.stepIndex - 1 : 0;
  const index = Number.isInteger(requested) && NETFLIX_STEPS[requested] ? requested : 0;
  const id = NETFLIX_STEPS[index];
  reset ||= step === "restart" || (step === "next" && completed);
  const frontier = reset ? 0 : Math.min(NETFLIX_COMPONENTS.length - 1, Math.max(previous.revealedCount - 1, index));
  if (index === 0) params.delete("step");
  else params.set("step", id);
  if (frontier > index) params.set("built", NETFLIX_STEPS[frontier]);
  else params.delete("built");
  const result = params.toString();
  return result ? `?${result}` : "";
}
