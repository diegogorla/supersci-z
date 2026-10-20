import "server-only";

export function getGoogleAnalyticsMeasurementId() {
  if (process.env.GOOGLE_ANALYTICS_ENABLED !== "true") return null;
  const value = process.env.GOOGLE_ANALYTICS_MEASUREMENT_ID?.trim();
  return value && /^G-[A-Z0-9]{5,20}$/.test(value) ? value : null;
}

export function isGoogleAnalyticsRuntimeReady() {
  return Boolean(getGoogleAnalyticsMeasurementId());
}
