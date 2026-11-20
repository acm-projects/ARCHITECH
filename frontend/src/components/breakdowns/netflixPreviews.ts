import type { PreviewFrame } from "./livePreview.ts";
import type { NETFLIX_STEPS } from "./netflix.ts";

export type NetflixStepId = typeof NETFLIX_STEPS[number];

// What a person watching would notice, in everyday words. Archie's panel carries the system
// terms. These are simulated, not Netflix data, with no real titles, artwork or measurements.
export const NETFLIX_PREVIEWS: Record<NetflixStepId, readonly PreviewFrame[]> = {
  viewer: [
    { caption: "Watch on your TV", ms: 1_100, connections: ["viewer-api"] },
    { caption: "Or on a laptop", ms: 1_100, connections: ["viewer-api"] },
    { caption: "Or on your phone", ms: 1_100, connections: ["viewer-api"] },
    { caption: "Same show, any screen", ms: 1_200, connections: ["viewer-api", "cdn-viewer"] },
  ],
  gateway: [
    { caption: "You browse for a show", ms: 1_100, connections: ["viewer-api"] },
    { caption: "Sent to the show list", ms: 1_200, connections: ["api-discovery"] },
    { caption: "You press play", ms: 1_100, connections: ["viewer-api"] },
    { caption: "Sent to the video player", ms: 1_200, connections: ["api-playback"] },
  ],
  discovery: [
    { caption: "Netflix has thousands of shows", ms: 1_000, connections: ["viewer-api", "api-discovery"] },
    { caption: "Your row is picked for you", ms: 1_300, connections: ["discovery-cache", "discovery-data"] },
    { caption: "A friend sees a different row", ms: 1_300, connections: ["discovery-cache", "discovery-data"] },
    { caption: "Even the poster can change", ms: 1_200, connections: ["api-discovery"] },
  ],
  data: [
    { caption: "You stop on your phone", ms: 1_100, connections: ["playback-data"] },
    { caption: "Netflix saves your spot", ms: 1_200, connections: ["playback-data"] },
    { caption: "Later, you turn on the TV", ms: 1_100, connections: ["discovery-data"] },
    { caption: "Picks up where you left off", ms: 1_300, connections: ["playback-data"] },
  ],
  cache: [
    { caption: "Your page starts loading", ms: 900, connections: ["discovery-cache"] },
    { caption: "Popular shows appear instantly", ms: 1_200, connections: ["discovery-cache"] },
    { caption: "Rare ones take a moment", ms: 1_200, connections: ["discovery-data"] },
    { caption: "Now everything is loaded", ms: 1_300, connections: ["discovery-data"] },
  ],
  playback: [
    { caption: "You press play", ms: 900, connections: ["api-playback"] },
    { caption: "Can you watch this show?", ms: 1_200, connections: ["playback-data"] },
    { caption: "Finding the right video", ms: 1_200, connections: ["api-playback"] },
    { caption: "Your show is ready", ms: 1_300, connections: ["playback-steering"] },
  ],
  steering: [
    { caption: "Which server sends your show?", ms: 900, connections: ["playback-steering"] },
    { caption: "This one is offline", ms: 1_100, connections: ["control-steering"] },
    { caption: "This one doesn't have your show", ms: 1_100, connections: ["control-steering"] },
    { caption: "This one works", ms: 1_500, connections: ["playback-steering"] },
  ],
  cdn: [
    { caption: "Your show streams in", ms: 1_100, connections: ["cdn-viewer"] },
    { caption: "Your Wi-Fi slows down", ms: 1_200, connections: ["cdn-viewer"] },
    { caption: "Blurrier, but it keeps playing", ms: 1_200, connections: ["cdn-viewer"] },
    { caption: "Wi-Fi's back, picture's sharp", ms: 1_300, connections: ["cdn-viewer"] },
  ],
  "cache-control": [
    { caption: "Servers check in: all good", ms: 1_100, connections: ["cdn-control"] },
    { caption: "One server stops answering", ms: 1_200, connections: ["cdn-control"] },
    { caption: "Netflix marks it as down", ms: 1_200, connections: ["control-steering"] },
    { caption: "Viewers go to a working one", ms: 1_300, connections: ["control-steering"] },
  ],
  assets: [
    { caption: "The finished show is stored", ms: 1_100, connections: ["encoding-assets"] },
    { caption: "It gets checked first", ms: 1_100, connections: ["encoding-assets"] },
    { caption: "Copies go out near viewers", ms: 1_300, connections: ["assets-cdn"] },
    { caption: "Ready before you press play", ms: 1_300, connections: ["assets-cdn"] },
  ],
  encoding: [
    { caption: "One video goes in", ms: 1_000, connections: ["encoding-assets"] },
    { caption: "A big version for TVs", ms: 1_300, connections: ["encoding-assets"] },
    { caption: "A medium one for laptops", ms: 1_100, connections: ["encoding-assets"] },
    { caption: "A small one for phones", ms: 1_300, connections: ["encoding-assets"] },
  ],
  review: [
    { caption: "The show is prepared early", ms: 1_100, connections: ["assets-cdn"] },
    { caption: "You press play", ms: 1_100, connections: ["viewer-api", "api-playback"] },
    { caption: "Netflix finds a server", ms: 1_200, connections: ["playback-steering"] },
    { caption: "Your show starts", ms: 1_400, connections: ["cdn-viewer"] },
  ],
};
