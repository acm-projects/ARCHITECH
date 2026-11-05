"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { flushSync } from "react-dom";

import { applyThemeClass, changeThemeWithTransition, themeClass, THEME_STORAGE_KEY, type Theme } from "../lib/theme";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export default function AppThemeBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";
  const [theme, setTheme] = useState<Theme>("light");
  // A view transition applies its update a frame later, so a second click cannot read state.
  const requestedTheme = useRef<Theme>("light");

  // Layout effects run before paint, so the saved theme replaces the server's default unseen.
  useLayoutEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === "light" || savedTheme === "dark") {
        requestedTheme.current = savedTheme;
        setTheme(savedTheme);
      }
    } catch (error) {
      console.error("Could not read the appearance preference.", error);
    }
  }, []);

  // The theme lives on <html> so the first paint and top-layer dialogs both see it.
  useLayoutEffect(() => {
    applyThemeClass(document.documentElement.classList, themeClass(pathname, theme));
  }, [pathname, theme]);

  const toggleTheme = () => {
    const nextTheme = requestedTheme.current === "dark" ? "light" : "dark";
    requestedTheme.current = nextTheme;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    changeThemeWithTransition(document, prefersReducedMotion, () => flushSync(() => setTheme(nextTheme)));
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch (error) {
      console.error("Could not save the appearance preference.", error);
    }
  };

  const effectiveTheme = isLanding ? "light" : theme;
  return (
    <ThemeContext.Provider value={{ theme: effectiveTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useAppTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useAppTheme must be used inside AppThemeBoundary.");
  return value;
}
