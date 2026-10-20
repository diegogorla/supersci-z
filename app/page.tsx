import type { Metadata } from "next";
import { serializeJsonLd } from "@/lib/security/json-ld";
import MagazineHome from "./magazine-home";
import { AdSenseVerification } from "./adsense-verification";
import { landingSeo, languageAlternates, localizedPath, resolveLocale } from "@/lib/seo/locales";
import { isMembershipRuntimeReady } from "@/lib/supabase/server-config";
import { getViewerSummary } from "@/lib/account/viewer";
import { getPublicArticles } from "@/lib/content/public";
import { getPageAdConfig } from "@/lib/adsense/server";
import { getOwnerPreview } from "@/lib/owner-preview/server";

const publicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "NewsMediaOrganization",
  name: "SUPER SCI-Z",
  url: "https://supersci-z.com",
  description: "Revista científica interdisciplinar e multilíngue sobre linguagem, mente, sociedade, física e cosmologia.",
  logo: { "@type": "ImageObject", url: "https://supersci-z.com/logo-z-orbit.png?v=60a283f03d83", width: 512, height: 512 },
  publishingPrinciples: "https://supersci-z.com/#metodo",
  knowsLanguage: ["pt-BR", "en", "es", "zh-CN", "hi", "ja", "ru"],
};

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const locale = resolveLocale((await searchParams).lang);
  const seo = landingSeo[locale];
  return {
    ...seo,
    alternates: { canonical: localizedPath("/", locale), languages: languageAlternates("/") },
    openGraph: { type: "website", url: localizedPath("/", locale), siteName: "SUPER SCI-Z", locale: locale === "pt" ? "pt_BR" : locale, ...seo },
    twitter: { card: "summary_large_image", ...seo },
  };
}

export const dynamic = "force-dynamic";

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = resolveLocale((await searchParams).lang);
  const [articles, adConfig, viewer, preview] = await Promise.all([getPublicArticles(), getPageAdConfig(), getViewerSummary(), getOwnerPreview()]);
  return <><AdSenseVerification /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(publicationJsonLd) }} /><MagazineHome initialNow={new Date().toISOString()} initialLocale={locale} subscriptionsLive={isMembershipRuntimeReady()} articles={articles} adConfig={adConfig} viewer={viewer} preview={preview} /></>;
}
