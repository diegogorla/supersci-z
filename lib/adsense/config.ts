import "server-only";

export function getAdsensePublisherId() {
  const raw = process.env.ADSENSE_PUBLISHER_ID?.trim();
  if (!raw) return null;
  const normalized = raw.startsWith("ca-") ? raw : `ca-${raw}`;
  return /^ca-pub-\d{10,20}$/.test(normalized) ? normalized : null;
}

// This Multiplex unit belongs to the publisher in the supplied AdSense code.
export function getAdsenseMultiplexSlotId() {
  return getAdsensePublisherId() === "ca-pub-1234143346239141" ? "6564696852" : null;
}

export function isAdsenseRuntimeReady() {
  return Boolean(
    process.env.ADSENSE_ENABLED === "true"
      && getAdsensePublisherId()
      && getAdsenseMultiplexSlotId()
      && process.env.GOOGLE_CMP_ENABLED === "true",
  );
}
