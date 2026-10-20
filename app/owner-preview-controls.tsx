"use client";

import { useState } from "react";
import { OWNER_PREVIEW_MODES, ownerPreviewProfile, type OwnerPreviewMode, type OwnerPreviewProfile } from "@/lib/owner-preview/model";
import { adExperienceLabel } from "@/lib/adsense/experience";

export function OwnerPreviewControls({ profile }: { profile: OwnerPreviewProfile | null }) {
  const [mode, setMode] = useState<OwnerPreviewMode>(profile?.mode ?? "visitor");
  const [exhausted, setExhausted] = useState(profile?.exhausted ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function apply(next: OwnerPreviewMode | null) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/owner-preview", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next, exhausted: next === "visitor" && exhausted }),
      });
      if (!response.ok) throw new Error("preview_unavailable");
      // A full reload unloads any advertising scripts from the previous document.
      window.location.reload();
    } catch {
      setMessage("Não foi possível alterar a visualização. Confirme seu acesso de proprietário e tente novamente.");
      setBusy(false);
    }
  }

  return <aside className="owner-preview" aria-label="Visualização exclusiva do proprietário">
    <div className="owner-preview-heading">
      <div><span className="owner-preview-eyebrow">SUPER SCI-Z · PROPRIETÁRIO</span>
        <h2>{profile ? "Visualização como " + profile.label : "Compare a experiência dos leitores"}</h2>
        <p>{profile ? "Seu acesso real de proprietário continua ativo. Esta é uma demonstração; créditos, assinatura e pagamentos permanecem intactos." : "Veja a revista e os artigos com a apresentação de cada perfil, sem alterar sua conta."}</p>
      </div>
      {profile && <button type="button" disabled={busy} onClick={() => apply(null)}>Voltar ao modo proprietário</button>}
    </div>
    <form className="owner-preview-form" onSubmit={(event) => { event.preventDefault(); void apply(mode); }}>
      <label>Visualizar como<select value={mode} disabled={busy} onChange={(event) => { setMode(event.target.value as OwnerPreviewMode); setExhausted(false); }}>
        {OWNER_PREVIEW_MODES.map((value) => <option key={value} value={value}>{ownerPreviewProfile({ mode: value, exhausted: false }).label}</option>)}
      </select></label>
      {mode === "visitor" && <label className="owner-preview-check"><input type="checkbox" disabled={busy} checked={exhausted} onChange={(event) => setExhausted(event.target.checked)} />Demonstrar cota esgotada</label>}
      <button type="submit" disabled={busy}>{busy ? "Aplicando…" : "Aplicar visualização"}</button>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Full navigation refreshes the verified preview and advertising state. */}
      <a href="/">Abrir revista</a><a href="/conta">Minha conta real</a>
    </form>
    {profile && <div className="owner-preview-facts">
      <span>{profile.mode === "visitor" ? (profile.exhausted ? "Encaminhamento aos planos" : "4 leituras por ciclo · sem consumo nesta prévia") : "Leitura ilimitada"}</span>
      <span>{adExperienceLabel(profile.experience)} · somente ilustrações</span>
      <span>{profile.devices} {profile.devices === 1 ? "dispositivo" : "dispositivos simultâneos"}{profile.invites ? " · até 2 convidados" : ""}</span>
    </div>}
    {profile && <p className="owner-preview-footnote">Os espaços ilustrados indicam onde entram os anúncios quando a veiculação estiver aprovada e configurada. Nenhum anúncio real é carregado nesta visualização. Para comprar ou comentar, volte ao modo proprietário.</p>}
    {message && <p role="alert" className="owner-preview-error">{message}</p>}
  </aside>;
}
