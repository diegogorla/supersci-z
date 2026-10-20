import { OwnerPreviewControls } from "./owner-preview-controls";
import "./owner-preview.css";
import { getOwnerPreview } from "@/lib/owner-preview/server";
import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./editorial-home.css";
import "./content-protection.css";
import { CookieConsent } from "./cookie-consent";
import { ThemePreferenceBootstrap } from "./theme-preference";
import { GoogleAnalytics } from "./google-analytics";
import { MetricoolTracker } from "./metricool-tracker";
import { isAdsenseRuntimeReady } from "@/lib/adsense/config";
import { getGoogleAnalyticsMeasurementId } from "@/lib/analytics/config";

export const metadata: Metadata = {
  metadataBase: new URL("https://supersci-z.com"),
  title: "SUPER SCI-Z — Ciência, IA, mente e universo",
  description: "Notícias e artigos sobre inteligência artificial, neurociência, linguística, filosofia, psicologia, física quântica, astronomia e cosmologia.",
  applicationName: "SUPER SCI-Z",
  authors: [{ name: "Redação SUPER SCI-Z" }],
  creator: "SUPER SCI-Z",
  publisher: "SUPER SCI-Z",
  category: "science",
  other: { "google-adsense-account": "ca-pub-1234143346239141" },
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/", types: { "application/rss+xml": "/feed.xml" } },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    alternateLocale: ["en_US", "es_ES", "zh_CN", "hi_IN", "ja_JP", "ru_RU"],
    url: "/",
    siteName: "SUPER SCI-Z",
    title: "SUPER SCI-Z — Ciência, IA, mente e universo",
    description: "Inteligência artificial, neurociência, linguagem, filosofia, física, astronomia e cosmologia com rigor e contexto.",
    images: [{ url: "/logo-z-orbit.png?v=60a283f03d83", width: 512, height: 512, alt: "Z orbital da SUPER SCI-Z" }],
  },
  twitter: { card: "summary", title: "SUPER SCI-Z", description: "Ciência, ideias e futuros.", images: ["/logo-z-orbit.png?v=60a283f03d83"] },
  icons: {
    icon: [
      { url: "/favicon.svg?v=60a283f03d83", type: "image/svg+xml" },
      { url: "/favicon-32.png?v=60a283f03d83", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico?v=60a283f03d83", sizes: "any", type: "image/x-icon" },
    ],
    shortcut: "/favicon.ico?v=60a283f03d83",
    apple: [{ url: "/apple-touch-icon.png?v=60a283f03d83", sizes: "180x180", type: "image/png" }],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const preview = await getOwnerPreview();
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="antialiased"><ThemePreferenceBootstrap nonce={nonce} />{!preview && <><GoogleAnalytics measurementId={getGoogleAnalyticsMeasurementId()} /><MetricoolTracker /></>}{preview && <OwnerPreviewControls profile={preview} />}{children}<CookieConsent advertisingEnabled={!preview && isAdsenseRuntimeReady()} /></body>
    </html>
  );
}
