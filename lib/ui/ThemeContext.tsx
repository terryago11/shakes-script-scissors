"use client";

import { createContext, useContext, useState, useEffect } from "react";

export type Theme = "light" | "dark" | "auto" | "1602";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "auto",
  setTheme: () => {},
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("auto");
  const [systemDark, setSystemDark] = useState(false);

  // Detect system preference on mount and listen for changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(mq.matches);
    function handleChange(e: MediaQueryListEvent) {
      setSystemDark(e.matches);
    }
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  // Read persisted theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("sss_theme") as Theme | null;
    if (stored && ["light", "dark", "auto", "1602"].includes(stored)) {
      setThemeState(stored);
    }
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem("sss_theme", t);
  }

  const isDark = theme === "dark" || (theme === "auto" && systemDark);

  // Apply/remove dark class on <html>
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  // Apply/remove renaissance class on <html>
  useEffect(() => {
    if (theme === "1602") {
      document.documentElement.classList.add("renaissance");
    } else {
      document.documentElement.classList.remove("renaissance");
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
