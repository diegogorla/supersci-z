import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CookiePreferencesButton } from "./cookie-consent";
import { BrandWordmark, FooterBrand } from "./brand-mark";

export function FooterLegalNav() {
  return (
    <nav className="footer-legal" aria-label="Institucional e legal">
      <Link href="/sobre">Sobre</Link>
      <Link href="/contato">Contato</Link>
      <Link href="/privacidade">Privacidade</Link>
      <Link href="/cookies">Cookies</Link>
      <Link href="/termos">Termos</Link>
      <Link href="/reembolsos-cancelamentos">Reembolsos e cancelamentos</Link>
      <a href="/assine">Assine</a>
      <CookiePreferencesButton />
    </nav>
  );
}

export function LegalShell({ eyebrow, title, intro, pageClassName, children, showUpdatedDate = true, updatedDate = "29 de agosto de 2026" }: { eyebrow: string; title: string; intro: ReactNode; pageClassName?: string; children: ReactNode; showUpdatedDate?: boolean; updatedDate?: string }) {
  return (
    <main className={`legal-page${pageClassName ? ` ${pageClassName}` : ""}`}>
      <header className="legal-header">
        <BrandWordmark href="/" />
        <Link className="legal-back" href="/"><ArrowLeft size={16} /> Voltar à revista</Link>
      </header>
      <article className="legal-document">
        <div className="legal-heading"><span>{eyebrow}</span><h1>{title}</h1>{intro && <p>{intro}</p>}{showUpdatedDate && <small>Última atualização: {updatedDate}</small>}</div>
        <div className="legal-copy">{children}</div>
      </article>
      <footer>
        <FooterBrand href="/" />
        <div className="footer-center"><p>Ciência, ideias e futuros.</p><FooterLegalNav /></div>
        <span>© 2026</span>
      </footer>
    </main>
  );
}
