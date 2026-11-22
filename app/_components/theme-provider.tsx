"use client";

import { Moon, Sun } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { trackAction } from "@/app/_components/activity-tracker";

export type ThemeMode = "light" | "dark";

interface ThemeContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (next: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => {},
  setTheme: () => {},
});

const STORAGE_KEY = "av_theme";
const listeners = new Set<() => void>();

function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getClientThemeSnapshot(): ThemeMode {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getServerThemeSnapshot(): ThemeMode {
  return "light";
}

function applyThemeToDom(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", mode === "dark");
  for (const listener of listeners) {
    listener();
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getClientThemeSnapshot,
    getServerThemeSnapshot
  );

  const setTheme = useCallback((next: ThemeMode) => {
    applyThemeToDom(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const current = getClientThemeSnapshot();
    const next: ThemeMode = current === "dark" ? "light" : "dark";
    applyThemeToDom(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore
    }
    trackAction({
      module: "appearance",
      action: `Switched display theme to ${next === "dark" ? "Dark Mode" : "Dirty White Light Mode"}`,
      controlLabel: next === "dark" ? "Dark Mode" : "Light Mode",
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggleButton({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--av-border-strong)] bg-[var(--av-surface)] px-3 py-2 text-xs font-semibold text-[var(--av-ink)] transition hover:bg-[var(--av-surface-subtle)]"
    >
      <Sun className="hidden h-3.5 w-3.5 shrink-0 dark:block" />
      <Moon className="block h-3.5 w-3.5 shrink-0 dark:hidden" />
      {!compact && (
        <>
          <span className="hidden dark:inline">Light</span>
          <span className="inline dark:hidden">Dark</span>
        </>
      )}
    </button>
  );
}
