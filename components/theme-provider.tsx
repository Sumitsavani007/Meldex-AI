"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ThemePreference = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: ThemePreference;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemePreference) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const shouldUseDark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", shouldUseDark);
  document.documentElement.dataset.theme = shouldUseDark ? "dark" : "light";
  document.documentElement.style.colorScheme = shouldUseDark ? "dark" : "light";
  return shouldUseDark ? "dark" : "light";
}

function useThemeState() {
  const [theme, setThemeState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem("meldex:theme") as ThemePreference | null;
    const initial = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    setThemeState(initial);
    setResolvedTheme(applyTheme(initial));

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const current = (localStorage.getItem("meldex:theme") as ThemePreference | null) ?? "system";
      if (current === "system") setResolvedTheme(applyTheme("system"));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "meldex:theme") return;
      const next = event.newValue === "light" || event.newValue === "dark" || event.newValue === "system"
        ? event.newValue
        : "system";
      setThemeState(next);
      setResolvedTheme(applyTheme(next));
    };
    media.addEventListener("change", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function setTheme(nextTheme: ThemePreference) {
    localStorage.setItem("meldex:theme", nextTheme);
    setThemeState(nextTheme);
    setResolvedTheme(applyTheme(nextTheme));
  }

  return { theme, resolvedTheme, setTheme };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const value = useThemeState();

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemePreference() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemePreference must be used inside ThemeProvider");
  }
  return context;
}
