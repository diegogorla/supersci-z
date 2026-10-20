"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import styles from "./editorial-dashboard.module.css";

export function HumanReviewForm({ reviewId, canFinalize, initialLanguageCount = 0, initialAdequacyCount = 0, initialAttractivenessCount = 0, initialNote = "" }: { reviewId: string; canFinalize: boolean; initialLanguageCount?: number; initialAdequacyCount?: number; initialAttractivenessCount?: number; initialNote?: string }) {
  const [languageCount, setLanguageCount] = useState(String(initialLanguageCount));
  const [adequacyCount, setAdequacyCount] = useState(String(initialAdequacyCount));
  const [attractivenessCount, setAttractivenessCount] = useState(String(initialAttractivenessCount));
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const valid = [languageCount, adequacyCount, attractivenessCount].every((v) => /^\d+$/.test(v) && Number(v) <= 100);

  async function submit(finalize: boolean) {
    if (busy || !valid || (finalize && !canFinalize)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/gestao/editorial/revisao-humana", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, languageCount: Number(languageCount), adequacyCount: Number(adequacyCount), attractivenessCount: Number(attractivenessCount), note: note.trim(), finalize }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        setMessage(body?.error === "review_window_open" ? "Você pode salvar as quantidades agora; a conclusão fica disponível após cinco dias." : "Não foi possível salvar. Seus valores permanecem nos campos; tente novamente.");
      } else if (finalize) {
        window.location.reload();
      } else {
        setMessage("Quantidades salvas. O rascunho não altera pontos.");
      }
    } catch { setMessage("Falha de conexão. Seus valores permanecem nos campos; tente novamente."); }
    finally { setBusy(false); }
  }

  return <div className={styles.reviewForm}>
    <div className={styles.countFields}>
      <label>Linguísticos (gramática/texto)<input type="number" inputMode="numeric" min={0} max={100} step={1} value={languageCount} onChange={(e) => setLanguageCount(e.target.value)} disabled={busy} /></label>
      <label>Adequação e outros<input type="number" inputMode="numeric" min={0} max={100} step={1} value={adequacyCount} onChange={(e) => setAdequacyCount(e.target.value)} disabled={busy} /></label>
      <label>Atratividade / relevância<input type="number" inputMode="numeric" min={0} max={100} step={1} value={attractivenessCount} onChange={(e) => setAttractivenessCount(e.target.value)} disabled={busy} /></label>
    </div>
    <label className={styles.curationNote}>Observações para a equipe (opcional)<textarea value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} disabled={busy} /></label>
    <p>Linguísticos: Luis −5 por erro; sem erros, +2. Adequação e outros: Luis −2 por artigo com apontamentos. Atratividade: Fred −2 por artigo, independentemente das outras categorias.</p>
    <p>Após cinco dias, curadoria humana sem nenhum apontamento acrescenta Luis +5, Fred +2 e Will +3. Com o bônus textual, Luis recebe +7 no total. Salvar rascunho não pontua.</p>
    {!canFinalize && <p>Você já pode salvar os números. A conclusão e a pontuação serão liberadas após o período de cinco dias.</p>}
    <div className={styles.reviewActions}>
      <Button type="button" variant="outline" disabled={busy || !valid} onClick={() => submit(false)}>Salvar quantidades</Button>
      <Button type="button" disabled={busy || !valid || !canFinalize} onClick={() => submit(true)}>Concluir curadoria e aplicar regras</Button>
    </div>
    {message && <p className={styles.formMessage} role="status">{message}</p>}
  </div>;
}
