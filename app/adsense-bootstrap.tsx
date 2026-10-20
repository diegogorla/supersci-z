"use client";

import { useEffect } from "react";

export function AdSenseBootstrap({ publisherId }: { publisherId: string | null }) {
  useEffect(() => {
    if (!publisherId || document.querySelector("script[data-super-sciz-adsense]")) return;
    const script = document.createElement("script");
    // Google propagates this document nonce to the scripts it loads.
    const nonceSource = document.querySelector<HTMLScriptElement>("script[nonce]");
    if (nonceSource?.nonce) script.nonce = nonceSource.nonce;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.superScizAdsense = "true";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(publisherId)}`;
    document.head.appendChild(script);
    return () => script.remove();
  }, [publisherId]);
  return null;
}
