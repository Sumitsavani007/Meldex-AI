"use client";

import { useEffect, useState } from "react";

type ThemePreference = "light" | "dark" | "system";

function applyTheme(theme: ThemePreference) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const shouldUseDark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", shouldUseDark);
}

export function useThemePreference() {
  const [theme, setThemeState] = useState<ThemePreference>("system");

  useEffect(() => {
    const stored = localStorage.getItem("meldex:theme") as ThemePreference | null;
    const initial = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    setThemeState(initial);
    applyTheme(initial);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const current = (localStorage.getItem("meldex:theme") as ThemePreference | null) ?? "system";
      if (current === "system") applyTheme("system");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function setTheme(nextTheme: ThemePreference) {
    localStorage.setItem("meldex:theme", nextTheme);
    setThemeState(nextTheme);
    applyTheme(nextTheme);
  }

  return { theme, setTheme };
}
