"use client";

import { OwnerPreviewAd } from "./owner-preview-ad";
import type { OwnerPreviewProfile } from "@/lib/owner-preview/model";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Atom, BookOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { locales, type PublicArticle, type Locale, ui } from "./content-public";
import { FooterLegalNav } from "./legal-shell";
import { AdSenseBootstrap } from "./adsense-bootstrap";
import type { TopicSlug } from "@/lib/seo/locales";
import { BrandWordmark, FooterBrand } from "./brand-mark";
import LandingIntroduction from "./landing-client";
import { LanguageSelect } from "./language-select";
import type { ViewerSummary } from "@/lib/account/viewer";
import type { PageAdConfig } from "@/lib/adsense/experience";
import { AdSenseUnit } from "./adsense-unit";
import { AccountLink } from "./account-link";

const categories = ["all", "language", "mind", "society", "physics", "cosmos"] as const;
const topicSlugByCategory: Record<(typeof categories)[number], TopicSlug | null> = {
  all: null,
  language: "linguistica",
  mind: "mente-psicologia",
  society: "filosofia-sociedade",
  physics: "fisica",
  cosmos: "cosmologia",
};

function useLocale(initialLocale: Locale) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("lang") as Locale | null;
    const saved = window.localStorage.getItem("super-sciz-lang") as Locale | null;
    const next = locales.some((item) => item.code === requested)
      ? requested!
      : locales.some((item) => item.code === saved)
        ? saved!
        : initialLocale;
    const timer = window.setTimeout(() => setLocaleState(next), 0);
    document.documentElement.lang = next === "pt" ? "pt-BR" : next === "zh" ? "zh-CN" : next;
    return () => window.clearTimeout(timer);
  }, [initialLocale]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem("super-sciz-lang", next);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState({}, "", url);
    document.documentElement.lang = next === "pt" ? "pt-BR" : next === "zh" ? "zh-CN" : next;
  };

  return [locale, setLocale] as const;
}

function LanguagePicker({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  return <LanguageSelect value={locale} label={ui[locale].languageLabel} onChange={onChange} />;
}

function ArticleCard({ article, locale, featured = false }: { article: PublicArticle; locale: Locale; featured?: boolean }) {
  const copy = article.copy[locale];
  return (
    <article className={featured ? "article-card featured-card" : "article-card"}>
      {article.image && <a className="card-image-link" href={`/artigo/${article.slug}?lang=${locale}`} aria-label={copy.title}>
        <Image className="card-image" src={article.image} alt={article.imageAlt ?? ""} width={1491} height={800} sizes={featured ? "(max-width: 760px) 100vw, 50vw" : "(max-width: 760px) 100vw, 25vw"} priority={featured} unoptimized />
      </a>}
      <div className="card-body">
        <div className="eyebrow-row">
          <span className="eyebrow">{copy.category}</span>
          <span className="reading-time">{article.readMinutes} {ui[locale].min}</span>
        </div>
        <h3><a href={`/artigo/${article.slug}?lang=${locale}`}>{copy.title}</a></h3>
        <p>{copy.dek}</p>
        <a className="read-link" href={`/artigo/${article.slug}?lang=${locale}`}>
          {ui[locale].read} <ArrowUpRight aria-hidden="true" size={17} />
        </a>
      </div>
    </article>
  );
}

function ArticleGrid({ items, locale }: { items: PublicArticle[]; locale: Locale }) {
  return <div className="archive-grid">{items.map((article) => <ArticleCard key={article.slug} article={article} locale={locale} />)}</div>;
}

export default function MagazineHome({ initialNow, initialLocale, adConfig, articles, viewer, preview = null, subscriptionsLive = false }: { initialNow: string; initialLocale: Locale; adConfig: PageAdConfig | null; articles: PublicArticle[]; viewer: ViewerSummary | null; preview?: OwnerPreviewProfile | null; subscriptionsLive?: boolean }) {
  const [locale, setLocale] = useLocale(initialLocale);
  const [now, setNow] = useState(initialNow);
  const [readerTimeZone, setReaderTimeZone] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => {
      setNow(new Date().toISOString());
      setReaderTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    };
    const first = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 1_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const copy = ui[locale];
  const { latest, dossiers, archive } = useMemo(() => {
    const latestItems = articles.slice(0, 8);
    const latestSlugs = new Set(latestItems.map((article) => article.slug));
    return {
      latest: latestItems,
      dossiers: articles.filter((article) => !article.isDaily && !latestSlugs.has(article.slug)),
      archive: articles.filter((article) => article.isDaily && !latestSlugs.has(article.slug)),
    };
  }, [articles]);

  return (
    <main lang={locale === "pt" ? "pt-BR" : locale === "zh" ? "zh-CN" : locale}>
      <AdSenseBootstrap publisherId={adConfig?.publisherId ?? null} />
      <header className="site-header">
        <div className="utility-bar">
          <span>{copy.daily}</span>
          <span className="live-dot"><i /> <time dateTime={now}>{readerTimeZone ? formatCurrentDate(locale, now, readerTimeZone) : "—"}</time></span>
          <AccountLink viewer={viewer} loginNext="/" />
          <LanguagePicker locale={locale} onChange={setLocale} />
        </div>
        <div className="brand-row">
          <h1 className="masthead-title"><BrandWordmark href={`/?lang=${locale}`} locale={locale} variant="masthead" priority /></h1>
        </div>
        <nav className="topic-nav" aria-label={copy.nav}>
          {categories.slice(1).map((category) => {
            const slug = topicSlugByCategory[category]!;
            return <Link key={category} href={`/tema/${slug}${locale === "pt" ? "" : `?lang=${locale}`}`}>{copy[category]}</Link>;
          })}
          <Link href="/sobre">{copy.about}</Link>
        </nav>
      </header>

      <LandingIntroduction locale={locale} subscriptionsLive={subscriptionsLive} />

      {preview?.experience === "standard" && <OwnerPreviewAd placement="feed" />}
      {adConfig?.experience === "standard" && adConfig.multiplexSlotId && <AdSenseUnit publisherId={adConfig.publisherId} slotId={adConfig.multiplexSlotId} placement="feed" format="autorelaxed" />}

      <section className="section-block latest-block">
        <div className="section-heading">
          <div><span className="section-number">01</span><h2>{copy.latest}</h2></div>
          <p>{copy.latestSub}</p>
        </div>
        <div className="latest-grid">
          {latest.map((article) => <ArticleCard key={article.slug} article={article} locale={locale} featured />)}
        </div>
      </section>

      <section className="method-strip" id="metodo">
        <div className="method-icon"><Atom aria-hidden="true" /></div>
        <div><span>EDITORIAL STANDARD</span><h2>{copy.method}</h2></div>
        <p>{copy.methodText}</p>
      </section>

      <section className="section-block dossier-block">
        <div className="section-heading">
          <div><span className="section-number">02</span><h2>{copy.dossiers}</h2></div>
          <p>{copy.dossiersSub}</p>
        </div>
        <div className="dossier-grid">
          {dossiers.map((article) => <ArticleCard key={article.slug} article={article} locale={locale} />)}
        </div>
      </section>

      <section className="section-block archive-block" id="indice">
        <div className="section-heading compact-heading">
          <div><BookOpen aria-hidden="true" /><h2>{copy.archive}</h2></div>
        </div>
        <Tabs defaultValue="all" className="archive-tabs">
          <TabsList variant="line" className="archive-tab-list" aria-label={copy.archive}>
            {categories.map((category) => <TabsTrigger key={category} value={category}>{copy[category]}</TabsTrigger>)}
          </TabsList>
          {categories.map((category) => (
            <TabsContent key={category} value={category}>
              <ArticleGrid locale={locale} items={category === "all" ? archive : archive.filter((article) => article.topics.includes(category))} />
            </TabsContent>
          ))}
        </Tabs>
      </section>

      <footer>
        <FooterBrand href={`/?lang=${locale}`} locale={locale} />
        <div className="footer-center"><p>{copy.footer}</p><FooterLegalNav /></div>
        <span>© 2026</span>
      </footer>
    </main>
  );
}

function formatCurrentDate(locale: Locale, value: string, timeZone: string) {
  const language = locale === "pt" ? "pt-BR" : locale === "zh" ? "zh-CN" : locale;
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "medium", timeZone }).format(new Date(value));
}
