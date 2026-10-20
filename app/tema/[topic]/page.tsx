import type { Metadata } from "next";
import { serializeJsonLd } from "@/lib/security/json-ld";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { ui } from "../../content-public";
import { FooterLegalNav } from "../../legal-shell";
import { htmlLanguage, languageAlternates, localizedPath, resolveLocale, topicSeo, topicSlugs, topics, type TopicSlug } from "@/lib/seo/locales";
import { getPublicArticles } from "@/lib/content/public";
import { BrandWordmark, FooterBrand } from "../../brand-mark";
import { getViewerSummary } from "@/lib/account/viewer";
import { AccountLink } from "../../account-link";

export function generateStaticParams() {
  return topicSlugs.map((topic) => ({ topic }));
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ topic: string }>; searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const { topic: rawTopic } = await params;
  if (!topicSlugs.includes(rawTopic as TopicSlug)) return {};
  const topic = rawTopic as TopicSlug;
  const locale = resolveLocale((await searchParams).lang);
  const seo = topicSeo(topic, locale);
  const path = `/tema/${topic}`;
  return {
    ...seo,
    alternates: { canonical: localizedPath(path, locale), languages: languageAlternates(path) },
    openGraph: { type: "website", url: localizedPath(path, locale), siteName: "SUPER SCI-Z", locale: locale === "pt" ? "pt_BR" : locale, ...seo },
    twitter: { card: "summary_large_image", ...seo },
  };
}

export default async function TopicPage({ params, searchParams }: { params: Promise<{ topic: string }>; searchParams: Promise<{ lang?: string }> }) {
  const { topic: rawTopic } = await params;
  if (!topicSlugs.includes(rawTopic as TopicSlug)) notFound();
  const topic = rawTopic as TopicSlug;
  const locale = resolveLocale((await searchParams).lang);
  const config = topics[topic];
  const seo = topicSeo(topic, locale);
  const [allArticles, viewer] = await Promise.all([getPublicArticles(), getViewerSummary()]);
  const items = allArticles.filter((article) => article.topics.includes(config.key));
  const pagePath = localizedPath(`/tema/${topic}`, locale);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", name: config.labels[locale], description: seo.description, url: `https://supersci-z.com${pagePath}`, inLanguage: htmlLanguage[locale] },
      { "@type": "ItemList", itemListElement: items.map((article, index) => ({ "@type": "ListItem", position: index + 1, url: `https://supersci-z.com${localizedPath(`/artigo/${article.slug}`, locale)}`, name: article.copy[locale].title })) },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "SUPER SCI-Z", item: "https://supersci-z.com/" },
        { "@type": "ListItem", position: 2, name: config.labels[locale], item: `https://supersci-z.com${pagePath}` },
      ] },
    ],
  };

  return (
    <main className="topic-page" lang={htmlLanguage[locale]}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <header className="article-header">
        <BrandWordmark href={localizedPath("/", locale)} locale={locale} />
        <div className="article-header-actions"><AccountLink viewer={viewer} loginNext={pagePath} /><Link className="back-link" href={localizedPath("/", locale)}><ArrowLeft size={16} /> {ui[locale].back}</Link></div>
      </header>
      <section className="topic-hero">
        <span className="editorial-label">SUPER SCI-Z / {config.key.toUpperCase()}</span>
        <h1>{config.labels[locale]}</h1>
        <p>{seo.description}</p>
      </section>
      <section className="section-block" aria-label={config.labels[locale]}>
        <div className="archive-grid">
          {items.map((article) => {
            const copy = article.copy[locale];
            const articlePath = localizedPath(`/artigo/${article.slug}`, locale);
            return <article className="article-card" key={article.slug}>
              {article.image && <a className="card-image-link" href={articlePath}><Image className="card-image" src={article.image} alt={article.imageAlt ?? ""} width={1491} height={800} sizes="(max-width: 760px) 100vw, 33vw" unoptimized /></a>}
              <div className="card-body"><span className="eyebrow">{copy.category}</span><h2><a href={articlePath}>{copy.title}</a></h2><p>{copy.dek}</p><a className="read-link" href={articlePath}>{ui[locale].read}<ArrowUpRight size={17} /></a></div>
            </article>;
          })}
        </div>
      </section>
      <footer><FooterBrand href={localizedPath("/", locale)} /><div className="footer-center"><p>{ui[locale].footer}</p><FooterLegalNav /></div><span>© 2026</span></footer>
    </main>
  );
}
