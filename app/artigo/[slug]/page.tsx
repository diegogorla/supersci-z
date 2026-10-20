import { getOwnerPreview } from "@/lib/owner-preview/server";
import type { Metadata } from "next";
import { serializeJsonLd } from "@/lib/security/json-ld";
import { notFound, redirect } from "next/navigation";
import { ArticleView } from "../../article-view";
import { AdSenseVerification } from "../../adsense-verification";
import { articles, locales, type Locale } from "../../content-public";
import { getProtectedArticleAccess } from "@/lib/content/protected";
import { isMembershipRuntimeReady } from "@/lib/supabase/server-config";
import { getPageAdConfig } from "@/lib/adsense/server";
import { htmlLanguage, languageAlternates, localizedPath, resolveLocale, topics } from "@/lib/seo/locales";
import { getPublicArticle } from "@/lib/content/public";
import { getViewerSummary } from "@/lib/account/viewer";
import { getPublishedArticleComments } from "@/lib/account/comments";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const locale = resolveLocale((await searchParams).lang);
  const article = await getPublicArticle(slug);
  if (!article) return {};
  const copy = article.copy[locale];
  const path = `/artigo/${article.slug}`;
  return {
    title: `${copy.title} | SUPER SCI-Z`,
    description: copy.dek,
    alternates: { canonical: localizedPath(path, locale), languages: languageAlternates(path) },
    openGraph: {
      type: "article",
      url: localizedPath(path, locale),
      title: copy.title,
      description: copy.dek,
      publishedTime: `${article.date}T12:00:00.000Z`,
      authors: ["Redação SUPER SCI-Z"],
      section: copy.category,
      locale: locale === "pt" ? "pt_BR" : locale,
      images: article.image ? [{ url: article.image, alt: article.imageAlt ?? "" }] : [],
    },
    twitter: { card: article.image ? "summary_large_image" : "summary", title: copy.title, description: copy.dek, images: article.image ? [article.image] : [] },
  };
}

export default async function ArticlePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { slug } = await params;
  const requestedLocale = (await searchParams).lang;
  const locale: Locale = locales.some((item) => item.code === requestedLocale) ? requestedLocale as Locale : "pt";
  const article = await getPublicArticle(slug);
  if (!article) notFound();
  const copy = article.copy[locale];
  const access = await getProtectedArticleAccess(article, locale);
  // A last available credit remains allowed. Only an exhausted denial redirects,
  // before any article body is rendered or sent to the reader.
  if (!access.allowed && access.reason === "quota_exhausted") {
    redirect(`/assine?motivo=cota&next=${encodeURIComponent(localizedPath(`/artigo/${article.slug}`, locale))}`);
  }
  const [viewer, comments, preview] = await Promise.all([
    getViewerSummary(),
    getPublishedArticleComments(article.slug),
    getOwnerPreview(),
  ]);
  const paywalled = isMembershipRuntimeReady();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": article.isDaily ? "NewsArticle" : "Article",
    headline: copy.title,
    description: copy.dek,
    ...(article.image ? { image: [article.image] } : {}),
    datePublished: `${article.date}T12:00:00.000Z`,
    dateModified: `${article.date}T12:00:00.000Z`,
    inLanguage: htmlLanguage[locale],
    mainEntityOfPage: `https://supersci-z.com${localizedPath(`/artigo/${article.slug}`, locale)}`,
    author: { "@type": "Organization", name: "Redação SUPER SCI-Z", url: "https://supersci-z.com/sobre" },
    publisher: { "@type": "NewsMediaOrganization", name: "SUPER SCI-Z", url: "https://supersci-z.com", logo: { "@type": "ImageObject", url: "https://supersci-z.com/logo-z-orbit.png?v=60a283f03d83", width: 512, height: 512 } },
    articleSection: copy.category,
    keywords: Object.values(topics).filter((topic) => article.topics.includes(topic.key)).flatMap((topic) => topic.searchTerms).join(", "),
    isAccessibleForFree: !paywalled,
    ...(paywalled ? { hasPart: { "@type": "WebPageElement", isAccessibleForFree: false, cssSelector: ".article-copy" } } : {}),
  };
  const content = access.allowed && access.body && access.takeaways ? { body: access.body, takeaways: access.takeaways } : null;
  const articleUrl = `https://supersci-z.com${localizedPath(`/artigo/${article.slug}`, locale)}`;
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "SUPER SCI-Z", item: "https://supersci-z.com/" },
      { "@type": "ListItem", position: 2, name: copy.title, item: articleUrl },
    ],
  };
  const adConfig = content ? await getPageAdConfig() : null;
  return <>{content && <AdSenseVerification />}<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} /><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} /><ArticleView article={article} locale={locale} content={content} access={{ allowed: access.allowed, remaining: access.remaining, reason: access.reason, metered: access.metered }} adConfig={adConfig} viewer={viewer} comments={comments} preview={preview} /></>;
}
