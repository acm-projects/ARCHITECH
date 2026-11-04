export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "architech-theme";

const THEME_CLASSES = ["ax-dark-app", "ax-light-app"] as const;

// The landing page is always light and carries no theme class.
export function themeClass(pathname: string, theme: Theme): string | null {
  if (pathname === "/") return null;
  return theme === "dark" ? "ax-dark-app" : "ax-light-app";
}

export function applyThemeClass(root: DOMTokenList, name: string | null) {
  root.remove(...THEME_CLASSES);
  if (name) root.add(name);
}

// Runs before first paint so a saved dark theme never shows a light frame on reload. It has to
// be plain inline source: the same rule as themeClass, with no imports.
export const THEME_BOOT_SCRIPT = `(function(){try{if(location.pathname==="/")return;var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});document.documentElement.classList.add(t==="dark"?"ax-dark-app":"ax-light-app")}catch(e){console.error("Could not read the appearance preference.",e)}})()`;
