"use client";

import { OwnerPreviewAd } from "./owner-preview-ad";
import type { OwnerPreviewProfile } from "@/lib/owner-preview/model";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { type PublicArticle, type Locale, ui } from "./content-public";
import { FooterLegalNav } from "./legal-shell";
import { AdSenseBootstrap } from "./adsense-bootstrap";
import { LanguageSelect } from "./language-select";
import { BrandWordmark, FooterBrand } from "./brand-mark";
import type { PageAdConfig } from "@/lib/adsense/experience";
import { AdSenseUnit } from "./adsense-unit";
import { AccountLink } from "./account-link";
import type { ViewerSummary } from "@/lib/account/viewer";
import { ArticleComments } from "./article-comments";
import type { PublicArticleComment } from "@/lib/account/comments";
import { splitArticleBody } from "@/lib/content/article-body";
import editorialFigures from "./editorial-figures.json";
import { ArticleCopyGuard } from "./article-copy-guard";

type ArticleContent = { body: string[]; takeaways: string[] } | null;
type ArticleAccess = { allowed: boolean; remaining: number; reason: string; metered: boolean };

// Private links use full document navigation to unload analytics before authentication.
export function ArticleView({ article, locale, content, access, adConfig, viewer, comments, preview = null }: { article: PublicArticle; locale: Locale; content: ArticleContent; access: ArticleAccess; adConfig: PageAdConfig | null; viewer: ViewerSummary | null; comments: PublicArticleComment[]; preview?: OwnerPreviewProfile | null }) {
  const router = useRouter();

  useEffect(() => {
    window.localStorage.setItem("super-sciz-lang", locale);
    document.documentElement.lang = locale === "pt" ? "pt-BR" : locale === "zh" ? "zh-CN" : locale;
  }, [locale]);

  const setLocale = (next: Locale) => {
    window.localStorage.setItem("super-sciz-lang", next);
    router.replace(`/artigo/${article.slug}?lang=${next}`);
  };

  const shell = ui[locale];
  const copy = article.copy[locale];
  const date = new Intl.DateTimeFormat(locale === "pt" ? "pt-BR" : locale === "zh" ? "zh-CN" : locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${article.date}T12:00:00Z`));
  const deviceLimitReached = access.reason === "device_limit";
  const deviceCookieMissing = access.reason === "device_cookie_required" || access.reason === "reader_cookie_required";
  const figure = (editorialFigures as Record<string, Partial<Record<Locale, { directUrl: string; altText: string; caption: string; credit: string; sourcePageUrl: string }>>>)[article.slug]?.[locale];
  const bodySections = content ? splitArticleBody(content.body) : null;

  return (
    <main className="article-page" lang={locale === "pt" ? "pt-BR" : locale === "zh" ? "zh-CN" : locale}>
      <ArticleCopyGuard />
      <AdSenseBootstrap publisherId={adConfig?.publisherId ?? null} />
      <header className="article-header">
        <BrandWordmark href={`/?lang=${locale}`} locale={locale} />
        <div className="article-header-actions"><AccountLink viewer={viewer} loginNext={`/artigo/${article.slug}?lang=${locale}`} /><LanguageSelect value={locale} label={shell.languageLabel} onChange={setLocale} /></div>
      </header>

      <div className="article-progress" aria-hidden="true"><span /></div>

      <article className="article-layout">
        <aside className="article-rail">
          <Link className="back-link" href={`/?lang=${locale}`}><ArrowLeft size={16} /> {shell.back}</Link>
          <div className="rail-code">Z/{article.isDaily ? "NEWS" : "DOSSIER"}</div>
          <div className="rail-meta"><span>{date}</span><span>{article.readMinutes} {shell.min}</span></div>
        </aside>

        <div className="article-main">
          <div className="article-category">{copy.category}</div>
          <h1>{copy.title}</h1>
          <p className="article-dek">{copy.dek}</p>

          {article.image && <figure className="article-figure">
            <Image src={figure?.directUrl ?? article.image} alt={figure?.altText ?? article.imageAlt ?? ""} width={1491} height={800} sizes="(max-width: 760px) 100vw, 910px" priority={article.isDaily} unoptimized />
            {figure?.caption && <figcaption>{figure.caption}</figcaption>}
            {article.imageCreditUrl && <figcaption>{shell.imageCredit}: <a href={article.imageCreditUrl} target="_blank" rel="noreferrer">{figure?.credit ?? article.imageCredit}</a></figcaption>}
          </figure>}

          {access.allowed && content ? <>
            {access.metered && <p className="article-access-note">{preview ? "Demonstração · nenhum crédito consumido" : "Leitura autorizada"}{access.remaining < 999999 ? ` · ${access.remaining} crédito(s) restante(s)` : " · acesso total"}</p>}
            {preview?.experience === "standard" && <OwnerPreviewAd placement="article" />}
            {adConfig?.experience === "standard" && adConfig.multiplexSlotId && <AdSenseUnit key={`${article.slug}:${locale}:multiplex`} publisherId={adConfig.publisherId} slotId={adConfig.multiplexSlotId} placement="article" format="autorelaxed" />}
            <div className="article-copy">
              <span className="editorial-label">{shell.editorial}</span>
              {bodySections?.narrative.map((paragraph, index) => <p key={index} className={index === 0 ? "first-paragraph" : undefined}>{paragraph}</p>)}
            </div>

            {bodySections && bodySections.criticalReading.length > 0 && <aside className="critical-reading" aria-labelledby="critical-reading-title">
              <span>Z/CRIT</span>
              <div>
                <h2 id="critical-reading-title">{shell.criticalReading}</h2>
                {bodySections.criticalReading.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              </div>
            </aside>}

            <section className="takeaways">
              <span>03</span>
              <div><h2>{shell.keyPoints}</h2><ul>{content.takeaways.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </section>
          </> : <section className="article-paywall" aria-labelledby="access-title">
            <span className="editorial-label">ACESSO SUPER SCI-Z</span>
            <h2 id="access-title">{deviceLimitReached ? "O limite de dispositivos do plano foi alcançado." : deviceCookieMissing ? "Este navegador precisa ser autorizado." : access.reason === "quota_exhausted" ? "Sua cota de leitura foi concluída." : "O conteúdo completo está protegido."}</h2>
            <p>{access.reason === "service_unavailable" ? "O serviço de leitura está temporariamente indisponível. Nenhum crédito foi consumido." : deviceLimitReached ? "Abra sua conta para remover um dispositivo antigo e liberar este navegador." : deviceCookieMissing ? "Permita os cookies essenciais e recarregue a página. Eles validam o dispositivo sem expor sua identidade ao navegador." : "Assine para leitura total ou entre na sua conta para usar os créditos disponíveis."}</p>
            <div>{deviceLimitReached ? <a className="landing-primary" href="/conta">Gerenciar dispositivos</a> : <Link className="landing-primary" href="/assine">Ver planos</Link>}{viewer ? <a className="read-link" href="/conta">Minha conta</a> : <a className="read-link" href={`/entrar?next=${encodeURIComponent(`/artigo/${article.slug}?lang=${locale}`)}`}>Entrar</a>}</div>
          </section>}

          <section className="source-box">
            <span>{shell.sources}</span>
            <a href={article.sourceUrl} target="_blank" rel="noreferrer">{article.sourceName}<ArrowUpRight size={18} /></a>
          </section>
          <ArticleComments articleSlug={article.slug} locale={locale} comments={comments} canComment={Boolean(viewer && viewer.accessTier !== "free")} preview={Boolean(preview)} />
        </div>
      </article>

      <footer>
        <FooterBrand href={`/?lang=${locale}`} />
        <div className="footer-center"><p>{shell.footer}</p><FooterLegalNav /></div>
        <span>© 2026</span>
      </footer>
    </main>
  );
}
