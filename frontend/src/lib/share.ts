import { normalizeProjectState, type ProjectState } from "./projectSchema.ts";
import type { Mode } from "../types";

const SHARE_PREFIX = "#share=";
const SHARE_VERSION = 1;

export interface SharedProjectPayload {
  version: number;
  name: string;
  mode: Mode;
  state: ProjectState;
}

function encodeUtf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeUtf8(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function createSharedProjectHash(input: {
  name: string;
  mode: Mode;
  state: unknown;
}): string {
  const payload: SharedProjectPayload = {
    version: SHARE_VERSION,
    name: input.name.trim() || "Shared architecture",
    mode: input.mode,
    state: normalizeProjectState(input.state),
  };

  return `${SHARE_PREFIX}${encodeUtf8(JSON.stringify(payload))}`;
}

export function parseSharedProjectHash(hash: string): SharedProjectPayload | null {
  if (!hash.startsWith(SHARE_PREFIX)) return null;

  try {
    const parsed = JSON.parse(decodeUtf8(hash.slice(SHARE_PREFIX.length))) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const payload = parsed as Record<string, unknown>;
    if (payload.version !== SHARE_VERSION) return null;
    if (payload.mode !== "learn" && payload.mode !== "challenge") return null;

    return {
      version: SHARE_VERSION,
      name:
        typeof payload.name === "string" && payload.name.trim()
          ? payload.name.trim()
          : "Shared architecture",
      mode: payload.mode,
      state: normalizeProjectState(payload.state),
    };
  } catch {
    return null;
  }
}
