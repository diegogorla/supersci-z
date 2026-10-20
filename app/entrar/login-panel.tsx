"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { authRequest } from "@/lib/security/auth-client";

type Provider = "google" | "apple";
type EmailAuthMode = "magiclink" | "otp";

export function LoginPanel({
  configured,
  next,
  initialMessage = "",
  googleEnabled,
  appleEnabled,
  emailAuthMode,
}: {
  configured: boolean;
  next: string;
  initialMessage?: string;
  googleEnabled: boolean;
  appleEnabled: boolean;
  emailAuthMode: EmailAuthMode;
}) {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [message, setMessage] = useState(initialMessage || (configured ? "" : "A conexão segura de cadastro está sendo ativada."));
  const [busy, setBusy] = useState(false);
  const socialLoginEnabled = googleEnabled || appleEnabled;

  async function socialLogin(provider: Provider) {
    if (!configured) return;
    const providerEnabled = provider === "google" ? googleEnabled : appleEnabled;
    if (!providerEnabled) {
      setMessage(`${provider === "google" ? "Google" : "Apple"} ainda está sendo ativado. Use o acesso por e-mail.`);
      return;
    }
    setBusy(true);
    setMessage("");
    const result = await authRequest({ action: "oauth", provider, next });
    if (result.ok && result.url) { window.location.assign(result.url); return; }
    setMessage("Não foi possível iniciar o login. Tente novamente.");
    setBusy(false);
  }

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    if (!configured) return;
    setBusy(true);
    setMessage("");
    const { ok } = await authRequest({ action: "email", email, next });
    setCodeSent(ok);
    setMessage(
      !ok
        ? "Não foi possível enviar o acesso. Confira o e-mail."
        : emailAuthMode === "otp"
          ? "Enviamos um código de acesso. Ele expira e só pode ser usado uma vez."
          : "Enviamos um link de acesso. Abra o e-mail e use o link uma única vez.",
    );
    setBusy(false);
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!configured) return;
    setBusy(true);
    setMessage("");
    const { ok } = await authRequest({ action: "verify", email, token: otp, next });
    if (!ok) {
      setMessage("Código inválido ou expirado. Solicite um novo código.");
      setBusy(false);
      return;
    }
    // A new authenticated document must not retain a previous reader's ad runtime.
    window.location.assign(next);
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="back-link" href="/"><ArrowLeft size={16} /> Voltar à revista</Link>
        <span className="editorial-label">CONTA SCI-Z</span>
        <h1>Leia mais. Receba menos ruído.</h1>
        <p>O cadastro libera seis artigos por ciclo e, depois da cota, um novo crédito a cada sete dias. Você controla os canais e pode cancelar os envios quando quiser.</p>

        {socialLoginEnabled && <><div className="auth-actions">
          {googleEnabled && <Button disabled={!configured || busy} onClick={() => socialLogin("google")}><LogIn /> Continuar com Google</Button>}
          {appleEnabled && <Button variant="outline" disabled={!configured || busy} onClick={() => socialLogin("apple")}><LogIn /> Continuar com Apple</Button>}
        </div><div className="auth-divider"><span>ou</span></div></>}

        <form onSubmit={sendCode} className="auth-email-form">
          <label htmlFor="email">E-mail</label>
          <Input id="email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" disabled={!configured || busy} />
          <Button type="submit" variant="secondary" disabled={!configured || busy}><Mail /> {emailAuthMode === "otp" ? "Receber código por e-mail" : "Receber link por e-mail"}</Button>
        </form>

        {codeSent && emailAuthMode === "otp" && <form onSubmit={verifyCode} className="auth-email-form auth-code-form">
          <label htmlFor="access-code">Código de 6 dígitos</label>
          <InputOTP id="access-code" maxLength={6} value={otp} onChange={setOtp} disabled={busy}>
            <InputOTPGroup>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} />)}</InputOTPGroup>
          </InputOTP>
          <Button type="submit" disabled={busy || otp.length !== 6}>Confirmar e entrar</Button>
          <small>O código é temporário e só deve ser usado por você.</small>
        </form>}

        {codeSent && emailAuthMode === "magiclink" && <small>Ao abrir o link, você entra automaticamente. A página “Minha conta” confirma que o acesso foi concluído.</small>}

        {message && <p className="auth-message" role="status">{message}</p>}
        <small><Link href="/entrar/administracao">Acesso administrativo</Link></small>
        <small>Ao continuar, você concorda com os <Link href="/termos">Termos</Link> e confirma que leu a <Link href="/privacidade">Política de Privacidade</Link>.</small>
      </section>
    </main>
  );
}
