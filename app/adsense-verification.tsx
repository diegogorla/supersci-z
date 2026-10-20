import "server-only";

import { headers } from "next/headers";
import { getAdsenseVerificationPublisherId } from "@/lib/adsense/server";

export async function AdSenseVerification() {
  const publisherId = await getAdsenseVerificationPublisherId();
  if (!publisherId) return null;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // React hoists async external scripts into <head>. The bootstrap recognizes
  // this same marker so enabling units does not download the library twice.
  return <script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`} crossOrigin="anonymous" nonce={nonce} data-super-sciz-adsense="true" />;
}
