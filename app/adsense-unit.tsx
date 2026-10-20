"use client";

import { useEffect, useRef } from "react";

type AdsWindow = Window & { adsbygoogle?: Record<string, unknown>[] };

export function AdSenseUnit({ publisherId, slotId, placement, format = "auto" }: { publisherId: string; slotId: string; placement: "feed" | "article"; format?: "auto" | "autorelaxed" }) {
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    const adsWindow = window as AdsWindow;
    adsWindow.adsbygoogle = adsWindow.adsbygoogle || [];
    adsWindow.adsbygoogle.push({});
  }, []);

  return (
    <aside className={`adsense-unit adsense-unit-${placement}`} aria-label="Publicidade">
      <span>PUBLICIDADE</span>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={publisherId}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive={format === "auto" ? "true" : undefined}
      />
    </aside>
  );
}
