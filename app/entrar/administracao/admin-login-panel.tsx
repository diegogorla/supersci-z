"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminLoginPanel({ configured, next = "/conta" }: { configured: boolean; next?: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !configured) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/admin-session", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fields.get("email"), password: fields.get("password") }),
      });
      if (response.ok) {
        form.reset();
        window.location.assign(next);
        return;
      }
      setMessage(response.status === 429
        ? "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente."
        : "Não foi possível entrar. Confira as credenciais e a permissão administrativa. Se sua conta usa autenticação em duas etapas, utilize o acesso habitual.");
    } catch {
      setMessage("Não foi possível conectar. Tente novamente.");
    }
    setBusy(false);
  }

  return <main className="auth-page"><section className="auth-card">
    <Link className="back-link" href="/entrar"><ArrowLeft size={16} /> Voltar</Link>
    <span className="editorial-label">ADMINISTRAÇÃO SCI-Z</span>
    <h1>Entrar na administração</h1>
    <p>Use o e-mail e a senha da sua conta administrativa.</p>
    <form className="auth-email-form" onSubmit={submit}>
      <label htmlFor="admin-email">E-mail</label>
      <Input id="admin-email" name="email" type="email" autoComplete="username" required maxLength={254} disabled={busy || !configured} />
      <label htmlFor="admin-password">Senha</label>
      <Input id="admin-password" name="password" type="password" autoComplete="current-password" required maxLength={256} disabled={busy || !configured} />
      <Button type="submit" disabled={busy || !configured}>{busy ? "Entrando…" : "Entrar"}</Button>
    </form>
    {!configured && <p className="auth-message" role="alert">O acesso está temporariamente indisponível.</p>}
    {message && <p className="auth-message" role="alert">{message}</p>}
  </section></main>;
}
