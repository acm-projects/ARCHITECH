"use client";

import { useCallback, useSyncExternalStore } from "react";

// On or off, remembered in this browser (in memory when storage is unavailable). Off by default.
const SETTING_KEY = "architech.livePreview";
let settingInMemory: boolean | null = null;
const listeners = new Set<() => void>();

function readSetting(): boolean {
  try {
    const stored = window.localStorage.getItem(SETTING_KEY);
    if (stored !== null) return stored === "on";
  } catch {
    // Storage blocked: fall back to memory.
  }
  return settingInMemory ?? false;
}

function writeSetting(on: boolean) {
  settingInMemory = on;
  try {
    window.localStorage.setItem(SETTING_KEY, on ? "on" : "off");
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function useLivePreviewSetting() {
  const enabled = useSyncExternalStore(subscribe, readSetting, () => false);
  const toggle = useCallback(() => writeSetting(!readSetting()), []);
  return { enabled, toggle };
}
