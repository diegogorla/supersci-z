"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ANALYTICS_CONSENT_EVENT, CONSENT_KEY, readConsentChoice, type ConsentChoice } from "./cookie-consent";
import { analyticsPageFields, analyticsPagePath } from "@/lib/analytics/privacy";
import { googleCommandQueue } from "@/lib/analytics/queue";

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    [key: `ga-disable-${string}`]: boolean | undefined;
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

function ensureGtag() {
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? googleCommandQueue((command) => { window.dataLayer?.push(command); });
  return window.gtag;
}

function clearAnalyticsCookies() {
  for (const item of document.cookie.split(";")) {
    const name = item.split("=")[0]?.trim();
    if (!name?.startsWith("_ga")) continue;
    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${location.hostname}; SameSite=Lax`;
  }
}

export function GoogleAnalytics({ measurementId }: { measurementId: string | null }) {
  const pathname = usePathname();
  const initialized = useRef(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!measurementId) return;
    const gtag = ensureGtag();
    gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      wait_for_update: 500,
    });

    const applyChoice = (choice: ConsentChoice | null) => {
      const analyticsGranted = choice?.analytics === true;
      window[`ga-disable-${measurementId}`] = !analyticsGranted || !analyticsPagePath(window.location.pathname);
      gtag("consent", "update", { analytics_storage: analyticsGranted ? "granted" : "denied" });
      setEnabled(analyticsGranted);
      if (!analyticsGranted) {
        clearAnalyticsCookies();
        // Reload after withdrawal to unload the already-running third-party script.
        if (initialized.current) window.location.reload();
      }
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
  }, [measurementId]);

  useEffect(() => {
    if (!measurementId) return;
    const page = analyticsPageFields(window.location.origin, pathname, document.title);
    window[`ga-disable-${measurementId}`] = !enabled || !page;
    if (!enabled || !page) return;
    const gtag = ensureGtag();
    if (!initialized.current) {
      initialized.current = true;
      const script = document.createElement("script");
      script.async = true;
      script.dataset.superScizAnalytics = "true";
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
      document.head.appendChild(script);
      gtag("js", new Date());
      gtag("config", measurementId, { send_page_view: false, page_location: page.page_location, page_referrer: "", allow_google_signals: false, allow_ad_personalization_signals: false, cookie_flags: "SameSite=Lax;Secure" });
    }
    gtag("event", "page_view", page);
  }, [enabled, measurementId, pathname]);

  return null;
}
