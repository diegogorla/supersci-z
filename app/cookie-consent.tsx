"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export const CONSENT_KEY = "supersciz-consent-v2";
export const ANALYTICS_CONSENT_EVENT = "supersciz:analytics-consent";
const OPEN_EVENT = "supersciz:open-cookies";

export type ConsentChoice = {
  essential: true;
  analytics: boolean;
  updatedAt: string;
};

export function readConsentChoice(): ConsentChoice | null {
  try {
    const stored = window.localStorage.getItem(CONSENT_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<ConsentChoice>;
    return parsed.essential === true && typeof parsed.analytics === "boolean"
      ? { essential: true, analytics: parsed.analytics, updatedAt: String(parsed.updatedAt ?? "") }
      : null;
  } catch {
    return null;
  }
}

function saveChoice(choice: ConsentChoice) {
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(choice));
  } catch {
    // The site remains usable when storage is blocked by the browser.
  }
  window.dispatchEvent(new CustomEvent<ConsentChoice>(ANALYTICS_CONSENT_EVENT, { detail: choice }));
}

export function CookiePreferencesButton({ className }: { className?: string }) {
  const openPreferences = () => window.dispatchEvent(new Event(OPEN_EVENT));

  return (
    <button className={className} type="button" onClick={openPreferences}>
      Gerenciar privacidade
    </button>
  );
}

function openGoogleAdPreferences() {
  const googlefc = (window as Window & {
      googlefc?: {
        callbackQueue?: { push: (callback: { CONSENT_API_READY: () => void }) => void };
        showRevocationMessage?: () => void;
      };
    }).googlefc;

  if (!googlefc?.callbackQueue) return;
  googlefc.callbackQueue.push({
    CONSENT_API_READY: () => googlefc.showRevocationMessage?.(),
  });
}

export function CookieConsent({ advertisingEnabled }: { advertisingEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const choice = readConsentChoice();
    const timer = window.setTimeout(() => {
      setAnalytics(choice?.analytics ?? false);
      setOpen(!choice);
    }, 0);
    const reopen = () => {
      const current = readConsentChoice();
      setAnalytics(current?.analytics ?? false);
      setManaging(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, reopen);
    return () => { window.clearTimeout(timer); window.removeEventListener(OPEN_EVENT, reopen); };
  }, []);

  const choose = (analyticsAllowed: boolean) => {
    saveChoice({ essential: true, analytics: analyticsAllowed, updatedAt: "2026-09-02" });
    setOpen(false);
    setManaging(false);
  };

  if (!open) return null;

  return (
    <section className="cookie-panel" role="dialog" aria-modal="false" aria-labelledby="cookie-title" aria-describedby="cookie-description">
      <div>
        <span>PRIVACIDADE / 001</span>
        <h2 id="cookie-title">Você escolhe o que fica no seu dispositivo.</h2>
        <p id="cookie-description">
          Cookies essenciais mantêm segurança, sessão, idioma e cota de leitura. Com sua autorização, o Metricool e, quando configurado, o Google Analytics medem audiência e desempenho editorial. O Metricool informa que seu rastreador não usa cookies; ele recebe dados de visita, como página acessada e IP, para estimar o país. {advertisingEnabled ? "As escolhas de publicidade são administradas separadamente pela plataforma de consentimento do Google." : "A publicidade permanece desligada."} Você poderá mudar sua escolha a qualquer momento.
        </p>
        {managing && <label className="cookie-option"><input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} /><span><strong>Métricas de audiência</strong>Metricool e, quando configurado, Google Analytics medem páginas visitadas e dados técnicos. Não é necessário para usar o site.</span></label>}
        <nav aria-label="Informações sobre privacidade"><Link href="/cookies">Política de cookies</Link><Link href="/privacidade">Privacidade</Link></nav>
      </div>
      <div className="cookie-actions">
        {managing ? <button className="cookie-primary" type="button" onClick={() => choose(analytics)}>Salvar escolhas</button> : <>
          <button className="cookie-secondary" type="button" onClick={() => choose(false)}>Somente essenciais</button>
          <button className="cookie-primary" type="button" onClick={() => choose(true)}>Aceitar Analytics</button>
          <button className="cookie-secondary" type="button" onClick={() => setManaging(true)}>Gerenciar opções</button>
        </>}
        {managing && advertisingEnabled && <button className="cookie-secondary" type="button" onClick={openGoogleAdPreferences}>Gerenciar publicidade</button>}
      </div>
    </section>
  );
}
