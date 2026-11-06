"use client";

import { useEffect, useSyncExternalStore } from "react";

const storageKey = "little-steps-theme";
const themeChangeEvent = "little-steps-theme-change";

function subscribeToTheme(onChange: () => void) {
  window.addEventListener(themeChangeEvent, onChange);
  return () => window.removeEventListener(themeChangeEvent, onChange);
}

function getThemeSnapshot() {
  return document.documentElement.dataset.theme === "dark";
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(storageKey);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const theme = savedTheme === "dark" || (savedTheme !== "light" && prefersDark) ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    window.dispatchEvent(new Event(themeChangeEvent));
  }, []);

  function toggleTheme() {
    const nextTheme = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(storageKey, nextTheme);
    window.dispatchEvent(new Event(themeChangeEvent));
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      className="theme-toggle fixed bottom-6 right-5 z-[100] inline-flex h-12 items-center gap-2 rounded-full border border-[#d7d9cd] bg-white px-4 text-xs font-semibold text-[#293d35] shadow-[0_8px_28px_rgba(41,61,53,0.16)] transition hover:-translate-y-0.5 hover:bg-[#fbf9f2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#788f75] max-sm:bottom-[5.5rem] max-sm:right-3"
    >
      {isDark ? (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
        </svg>
      ) : (
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="size-4">
          <path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z" />
        </svg>
      )}
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}
