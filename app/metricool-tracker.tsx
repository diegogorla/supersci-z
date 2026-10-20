"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ANALYTICS_CONSENT_EVENT, CONSENT_KEY, readConsentChoice, type ConsentChoice } from "./cookie-consent";
import { analyticsPagePath } from "@/lib/analytics/privacy";

const TRACKER_HASH = "ad6a1418fd29248ce978d22db47fbb26";

declare global {
  interface Window {
    beTracker?: { t: (options: { hash: string }) => void };
    __superScizMetricoolPromise?: Promise<void>;
  }
}

function loadMetricool() {
  if (window.beTracker) return Promise.resolve();
  if (window.__superScizMetricoolPromise) return window.__superScizMetricoolPromise;

  window.__superScizMetricoolPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://tracker.metricool.com/resources/be.js";
    script.dataset.superScizMetricool = "true";
    script.onload = () => resolve();
    script.onerror = () => {
      window.__superScizMetricoolPromise = undefined;
      script.remove();
      reject(new Error("Metricool tracker failed to load"));
    };
    document.head.appendChild(script);
  });

  return window.__superScizMetricoolPromise;
}

export function MetricoolTracker() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const sentPath = useRef<string | null>(null);

  useEffect(() => {
    const applyChoice = (choice: ConsentChoice | null) => {
      const nextEnabled = choice?.analytics === true;
      setEnabled(nextEnabled);
      if (!nextEnabled && sentPath.current) window.location.reload();
    };

    applyChoice(readConsentChoice());
    const onConsent = (event: Event) => applyChoice((event as CustomEvent<ConsentChoice>).detail);
    const onStorage = (event: StorageEvent) => {
      if (event.key === CONSENT_KEY) applyChoice(readConsentChoice());
    };
    window.addEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const page = analyticsPagePath(pathname);
    if (!enabled || !page || sentPath.current === page) return;

    let cancelled = false;
    void loadMetricool().then(() => {
      if (cancelled || !window.beTracker) return;
      window.beTracker.t({ hash: TRACKER_HASH });
      sentPath.current = page;
    }).catch(() => {
      // A blocked analytics request must not affect reading or navigation.
    });
    return () => { cancelled = true; };
  }, [enabled, pathname]);

  return null;
}
