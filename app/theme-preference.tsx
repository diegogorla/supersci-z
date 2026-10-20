"use client";

import { useEffect } from "react";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "super-sciz-theme:v1";
const CHANGE_EVENT = "super-sciz-theme-change";
const BOOTSTRAP_SCRIPT = `(function(){try{var p=localStorage.getItem('super-sciz-theme:v1');p=p==='light'||p==='dark'?p:'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.themePreference=p;}catch(e){document.documentElement.dataset.theme='light';document.documentElement.dataset.themePreference='system';}})();`;

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function applyTheme(preference: ThemePreference) {
  const dark = preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themePreference = preference;
}

export function saveThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {}
  applyTheme(preference);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeThemePreference(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

export function ThemePreferenceBootstrap({ nonce }: { nonce?: string }) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => applyTheme(readThemePreference());
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, []);

  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: BOOTSTRAP_SCRIPT }} />;
}
