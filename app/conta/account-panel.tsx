"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BrandWordmark } from "../brand-mark";
import { useRouter } from "next/navigation";
import { BadgeCheck, CalendarDays, Copy, CreditCard, EyeOff, Gauge, LogOut, MonitorCog, Send, Trash2, UsersRound } from "lucide-react";
import { authRequest } from "@/lib/security/auth-client";
import { ACCESS_TIER_LABELS, getPlanPresentation, isAccessTier, type AccessTier } from "@/lib/account/plans";
import { readThemePreference, saveThemePreference, subscribeThemePreference, type ThemePreference } from "@/app/theme-preference";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { adExperienceForAccess, adExperienceLabel } from "@/lib/adsense/experience";

type Preferences = { email_opt_in: boolean; whatsapp_opt_in: boolean; telegram_opt_in: boolean; sms_opt_in: boolean };
type Subscription = {
  plan_code: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  provider: string | null;
  hasBillingReference: boolean;
  created_at: string;
};
type Entitlement = {
  access_tier: string;
  source: string;
  valid_from: string;
  valid_until: string | null;
  revoked_at: string | null;
  ads_enabled: boolean;
  device_limit: number;
  household_slots: number;
  provider_environment: string | null;
  shared_access: boolean;
};
type HouseholdMember = { id: string; emailHint: string; status: string; acceptedAt: string | null };
type AccessDevice = { id: string; label: string; lastSeenAt: string; current: boolean; own: boolean };
type EditorialQuestion = { id: string; body: string; priority: boolean; status: string; createdAt: string };
type ModerationComment = { id: string; articleSlug: string; author: string; body: string; status: string; createdAt: string };

const initialPreferences: Preferences = { email_opt_in: false, whatsapp_opt_in: false, telegram_opt_in: false, sms_opt_in: false };
const statusLabels: Record<string, string> = {
  incomplete: "Aguardando confirmação",
  trialing: "Período de teste ativo",
  active: "Ativa",
  past_due: "Pagamento pendente",
  paused: "Pausada",
  canceled: "Cancelada",
  expired: "Expirada",
  refunded: "Reembolsada",
};

export function AccountPanel({
  accessConfirmed,
  authEnabled,
  billingActionsEnabled,
  displayName,
  email,
  preferences: storedPreferences,
  credits,
  subscription,
  entitlement,
  householdMembers,
  devices,
  questions,
  authority,
  moderationComments,
  moderationQuestions,
}: {
  accessConfirmed: boolean;
  authEnabled: boolean;
  billingActionsEnabled: boolean;
  displayName: string;
  email: string;
  preferences: Preferences | null;
  credits: number | null;
  subscription: Subscription | null;
  entitlement: Entitlement | null;
  householdMembers: HouseholdMember[];
  devices: AccessDevice[];
  questions: EditorialQuestion[];
  authority: "reader" | "editor" | "admin";
  moderationComments: ModerationComment[];
  moderationQuestions: EditorialQuestion[];
}) {
  const router = useRouter();
  const [preferences, setPreferences] = useState(storedPreferences ?? initialPreferences);
  const theme = useSyncExternalStore(subscribeThemePreference, readThemePreference, () => "system");
  const [message, setMessage] = useState(
    accessConfirmed
      ? "Acesso concluído com segurança. Você já está conectado."
      : authEnabled
        ? ""
        : "O cadastro seguro está sendo ativado.",
  );
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [householdEmail, setHouseholdEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [question, setQuestion] = useState("");

  const accessTier: AccessTier = (() => {
    if (!entitlement || entitlement.revoked_at || (entitlement.valid_until && new Date(entitlement.valid_until) <= new Date())) return "free";
    return isAccessTier(entitlement.access_tier) ? entitlement.access_tier : "free";
  })();
  const plan = getPlanPresentation(subscription?.plan_code);
  const tierLabel = ACCESS_TIER_LABELS[accessTier];
  const adExperience = adExperienceForAccess(accessTier, accessTier === "free" ? true : entitlement?.ads_enabled);
  const recurring = Boolean(plan?.recurring && subscription?.hasBillingReference);
  const billingDate = subscription?.status === "trialing" && subscription.trial_ends_at
    ? subscription.trial_ends_at
    : subscription?.current_period_end;
  const billingDateLabel = subscription?.status === "trialing" ? "Primeira cobrança prevista" : "Próxima renovação";
  const sharedAccess = Boolean(entitlement?.shared_access);
  const activeHouseholdCount = householdMembers.filter((member) => member.status === "active").length;
  const ownerDeviceAllowance = accessTier === "cosmos" && !sharedAccess
    ? Math.max(1, (entitlement?.device_limit ?? 3) - activeHouseholdCount)
    : entitlement?.device_limit ?? 1;
  const questionsSection = accessTier === "cosmos" && !sharedAccess ? 4 : accessTier !== "free" ? 3 : 2;
  const canModerate = authority === "editor" || authority === "admin";
  const moderationSection = questionsSection + 1;
  const preferencesSection = questionsSection + (canModerate ? 2 : 1);

  async function toggle(key: keyof Preferences, value: boolean) {
    const previous = preferences;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    const response = await fetch("/api/account/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    if (!response.ok) setPreferences(previous);
    setMessage(response.ok ? "Preferência salva. Você poderá alterá-la quando quiser." : "Não foi possível salvar. Tente novamente.");
  }

  function updateTheme(value: ThemePreference) {
    saveThemePreference(value);
    setMessage("Preferência de aparência salva neste dispositivo.");
  }

  async function signOut() {
    const { ok } = await authRequest({ action: "logout" });
    if (!ok) { setMessage("Não foi possível encerrar a sessão. Tente novamente."); return; }
    router.push("/");
    router.refresh();
  }

  async function cancelSubscription() {
    setBusy(true);
    const response = await fetch("/api/account/cancel", { method: "POST" });
    setMessage(response.ok ? "Pedido de cancelamento registrado. O acesso permanece até a confirmação do provedor." : "Não foi possível registrar o cancelamento.");
    setBusy(false);
  }

  async function manageBilling() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/paddle/portal", { method: "POST" });
    const result = await response.json().catch(() => ({}));
    if (response.ok && typeof result.url === "string") {
      try {
        const destination = new URL(result.url);
        if (destination.protocol === "https:" && (destination.hostname === "paddle.com" || destination.hostname.endsWith(".paddle.com"))) {
          window.location.assign(destination.href);
          return;
        }
      } catch {}
    }
    setMessage("Não foi possível abrir o portal de pagamentos agora.");
    setBusy(false);
  }

  async function deleteAccount() {
    setBusy(true);
    const response = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) });
    const result = await response.json().catch(() => ({}));
    if (response.ok && result.state === "deleted") {
      router.push("/?conta=excluida");
      router.refresh();
      return;
    }
    setMessage(response.ok ? "Exclusão registrada. Concluiremos após o cancelamento de qualquer cobrança ativa." : "Não foi possível excluir a conta agora.");
    setBusy(false);
  }

  async function inviteHousehold(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setInviteUrl("");
    const response = await fetch("/api/account/household", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: householdEmail }) });
    const result = await response.json().catch(() => ({}));
    if (response.ok && typeof result.inviteUrl === "string") {
      setInviteUrl(result.inviteUrl);
      setHouseholdEmail("");
      setMessage("Convite criado. Envie o link somente à pessoa indicada.");
    } else {
      setMessage(result.error === "slot_limit" ? "As duas vagas Cosmos já estão em uso." : "Não foi possível criar o convite.");
    }
    setBusy(false);
  }

  async function copyInvite() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setMessage("Link de convite copiado.");
    } catch {
      setMessage("Não foi possível copiar automaticamente. Selecione o endereço acima e copie-o manualmente.");
    }
  }

  async function revokeHousehold(id: string) {
    setBusy(true);
    const response = await fetch("/api/account/household", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setMessage(response.ok ? "Acesso compartilhado revogado." : "Não foi possível revogar o acesso.");
    setBusy(false);
    if (response.ok) router.refresh();
  }

  async function revokeDevice(id: string) {
    setBusy(true);
    const response = await fetch("/api/account/devices", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setMessage(response.ok ? "Dispositivo removido do plano." : "Não foi possível remover o dispositivo.");
    setBusy(false);
    if (response.ok) router.refresh();
  }

  async function submitQuestion(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/account/questions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: question }) });
    setMessage(response.ok ? (accessTier === "cosmos" ? "Pergunta enviada com prioridade Cosmos." : "Pergunta enviada à redação.") : "Não foi possível enviar a pergunta.");
    if (response.ok) setQuestion("");
    setBusy(false);
    if (response.ok) router.refresh();
  }

  async function moderate(type: "comment" | "question", id: string, action: string) {
    setBusy(true);
    const response = await fetch("/api/account/moderation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, action }),
    });
    setMessage(response.ok ? "Fila editorial atualizada." : "Não foi possível atualizar a fila editorial.");
    setBusy(false);
    if (response.ok) router.refresh();
  }

  return (
    <main className="account-page">
      <section className="account-card">
        <header className="account-identity">
          <div>
            <BrandWordmark href="/" />
            <span className="editorial-label">MINHA CONTA</span>
            <h1>{displayName || "Conta do leitor"}</h1>
            {email && <p>{email}</p>}
          </div>
          <span className={`account-tier account-tier-${accessTier}`}><BadgeCheck size={17} /> Plano {tierLabel}</span>
        </header>

        {sharedAccess && <p className="account-runtime-note">O titular Cosmos concedeu a esta conta um perfil equivalente ao Fundador: leitura ilimitada, comentários e experiência sem anúncios. A cobrança, os convites e a prioridade editorial permanecem exclusivos do titular.</p>}
        {!billingActionsEnabled && !sharedAccess && <p className="account-runtime-note">Sua conta e sua categoria estão registradas. A leitura permanece aberta; cobranças e cotas não estão em operação neste momento.</p>}

        <section className="account-section" aria-labelledby="access-title">
          <div className="account-section-heading"><span>01</span><div><h2 id="access-title">Acesso e assinatura</h2><p>O que sua conta possui agora e como a cobrança está organizada.</p></div></div>
          <div className="account-summary-grid">
            <article><Gauge aria-hidden="true" /><span>Plano ativo</span><strong>{sharedAccess ? "Fundador compartilhado" : plan?.name ?? `Plano ${tierLabel}`}</strong><small>{sharedAccess ? "Benefício concedido pelo titular Cosmos" : statusLabels[subscription?.status ?? ""] ?? (accessTier === "free" ? "Acesso gratuito" : "Benefício ativo")}</small></article>
            <article><CreditCard aria-hidden="true" /><span>Valor contratado</span><strong>{sharedAccess ? "Incluído" : plan?.price ?? "R$ 0,00"}</strong><small>{sharedAccess ? "sem cobrança nesta conta" : plan?.cadence ?? "sem cobrança recorrente"}</small></article>
            <article><CalendarDays aria-hidden="true" /><span>{billingDate ? billingDateLabel : "Vigência"}</span><strong>{billingDate ? formatDate(billingDate) : accessTier === "lifetime" ? "Sem vencimento" : "Sem cobrança"}</strong><small>{subscription?.cancel_at_period_end ? "Renovação cancelada ao fim do período" : recurring ? "Renovação automática" : "Sem renovação automática"}</small></article>
            <article><EyeOff aria-hidden="true" /><span>Publicidade</span><strong>{adExperienceLabel(adExperience)}</strong><small>{adExperience === "none" ? "O código de anúncios não é carregado" : "Carga do acesso gratuito quando a publicidade estiver ativa"}</small></article>
            <article><MonitorCog aria-hidden="true" /><span>Dispositivos</span><strong>{ownerDeviceAllowance}</strong><small>{accessTier === "cosmos" && !sharedAccess ? "vagas simultâneas do titular neste momento" : "dispositivo simultâneo deste perfil"}</small></article>
            <article><UsersRound aria-hidden="true" /><span>Compartilhamentos</span><strong>{entitlement?.household_slots ?? 0}</strong><small>{accessTier === "cosmos" && !sharedAccess ? "perfis Fundador que você pode conceder" : "sem direito a novos convites"}</small></article>
          </div>

          {credits !== null && accessTier === "free" && billingActionsEnabled && <div className="credit-panel"><strong>{credits}</strong><span>artigos disponíveis agora</span></div>}
          {subscription?.provider === "paddle" && <div className="account-actions">
            <Button variant="outline" disabled={busy || !billingActionsEnabled} onClick={manageBilling}>Gerenciar cobrança e renovação</Button>
            {recurring && <Button variant="outline" disabled={busy || !billingActionsEnabled || subscription.cancel_at_period_end} onClick={cancelSubscription}>Cancelar renovação</Button>}
          </div>}
          {subscription?.provider === "paddle" && !billingActionsEnabled && <small>O portal de pagamentos será liberado quando a infraestrutura comercial entrar em operação. As opções disponíveis serão as permitidas pelo Paddle para o estado atual da assinatura.</small>}
          {accessTier === "free" && <Link className="legal-action" href="/assine">Conhecer os planos</Link>}
        </section>

        {accessTier !== "free" && <section className="account-section" aria-labelledby="devices-title">
          <div className="account-section-heading"><span>02</span><div><h2 id="devices-title">Dispositivos do plano</h2><p>Quando não houver vaga livre, este acesso substituirá automaticamente o dispositivo deste perfil cujo último acesso ocorreu há mais tempo.</p></div></div>
          <div className="account-list">
            {devices.length === 0 ? <p>Nenhum dispositivo foi registrado desde a ativação do benefício.</p> : devices.map((device) => <article key={device.id}><div><strong>{device.label}</strong><small>{device.current ? "Este dispositivo · " : ""}último uso em {formatDateTime(device.lastSeenAt)}{!device.own ? " · perfil compartilhado" : ""}</small></div><Button variant="outline" size="sm" disabled={busy} onClick={() => revokeDevice(device.id)}><Trash2 size={15} /> Remover</Button></article>)}
          </div>
        </section>}

        {accessTier === "cosmos" && !sharedAccess && <section className="account-section" aria-labelledby="household-title">
          <div className="account-section-heading"><span>03</span><div><h2 id="household-title">Perfis Cosmos</h2><p>Você dispõe de três acessos simultâneos. Cada um dos até {entitlement?.household_slots ?? 2} convites aceitos reserva uma vaga e concede ao convidado benefícios equivalentes ao Fundador, sem anúncios. As vagas não cedidas permanecem disponíveis para seus próprios dispositivos; se for necessário liberar uma, sai aquele cujo último acesso ocorreu há mais tempo.</p></div></div>
          <form className="account-inline-form" onSubmit={inviteHousehold}><label htmlFor="household-email">E-mail do novo perfil</label><div><input id="household-email" type="email" required maxLength={254} value={householdEmail} onChange={(event) => setHouseholdEmail(event.target.value)} placeholder="pessoa@exemplo.com" /><Button disabled={busy || householdMembers.length >= (entitlement?.household_slots ?? 0)}>Criar convite</Button></div></form>
          {inviteUrl && <div className="invite-link"><input aria-label="Link de convite" readOnly value={inviteUrl} /><Button variant="outline" onClick={copyInvite}><Copy size={15} /> Copiar</Button></div>}
          <div className="account-list">{householdMembers.map((member) => <article key={member.id}><div><strong>{member.emailHint}</strong><small>{member.status === "active" ? "Perfil ativo" : "Aguardando aceite"}</small></div><Button variant="outline" size="sm" disabled={busy} onClick={() => revokeHousehold(member.id)}><Trash2 size={15} /> Revogar</Button></article>)}</div>
        </section>}

        <section className="account-section" aria-labelledby="questions-title">
          <div className="account-section-heading"><span>{String(questionsSection).padStart(2, "0")}</span><div><h2 id="questions-title">Perguntas à redação</h2><p>{accessTier === "cosmos" ? "Perguntas Cosmos entram identificadas como prioritárias." : "Envie questões que possam orientar apurações, dossiês e explicações futuras."}</p></div></div>
          <form className="account-question-form" onSubmit={submitQuestion}><label htmlFor="editorial-question">Sua pergunta</label><textarea id="editorial-question" minLength={10} maxLength={2000} required value={question} onChange={(event) => setQuestion(event.target.value)} /><Button disabled={busy || question.trim().length < 10}><Send size={16} /> Enviar pergunta</Button></form>
          <div className="account-list">{questions.map((item) => <article key={item.id}><div><strong>{item.body}</strong><small>{questionStatus(item.status)} · {formatDateTime(item.createdAt)}{item.priority ? " · prioridade Cosmos" : ""}</small></div></article>)}</div>
        </section>

        {canModerate && <section className="account-section" aria-labelledby="moderation-title">
          <div className="account-section-heading"><span>{String(moderationSection).padStart(2, "0")}</span><div><h2 id="moderation-title">Fila editorial</h2><p>Comentários aguardam publicação; perguntas prioritárias aparecem primeiro.</p></div></div>
          <h3>Comentários pendentes</h3>
          <div className="account-list">{moderationComments.length === 0 ? <p>Nenhum comentário aguarda moderação.</p> : moderationComments.map((item) => <article key={item.id}><div><strong>{item.author} · {item.articleSlug}</strong><span>{item.body}</span><small>{formatDateTime(item.createdAt)}</small></div><div className="moderation-actions"><Button size="sm" disabled={busy} onClick={() => moderate("comment", item.id, "published")}>Publicar</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => moderate("comment", item.id, "rejected")}>Rejeitar</Button></div></article>)}</div>
          <h3>Perguntas recebidas</h3>
          <div className="account-list">{moderationQuestions.length === 0 ? <p>Nenhuma pergunta aguarda análise.</p> : moderationQuestions.map((item) => <article key={item.id}><div><strong>{item.priority ? "Prioridade Cosmos" : "Pergunta de leitor"}</strong><span>{item.body}</span><small>{questionStatus(item.status)} · {formatDateTime(item.createdAt)}</small></div><div className="moderation-actions"><Button size="sm" disabled={busy} onClick={() => moderate("question", item.id, "reviewing")}>Em análise</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => moderate("question", item.id, "answered")}>Respondida</Button><Button variant="outline" size="sm" disabled={busy} onClick={() => moderate("question", item.id, "closed")}>Encerrar</Button></div></article>)}</div>
        </section>}

        <section className="account-section" aria-labelledby="preferences-title">
          <div className="account-section-heading"><span>{String(preferencesSection).padStart(2, "0")}</span><div><h2 id="preferences-title">Preferências</h2><p>Você decide como ler e se deseja receber atualizações.</p></div></div>
          <label className="theme-preference" htmlFor="theme-preference"><span><strong>Aparência</strong><small>Aplicada neste dispositivo</small></span><select id="theme-preference" value={theme} onChange={(event) => updateTheme(event.target.value as ThemePreference)}><option value="system">Seguir o dispositivo</option><option value="light">Modo claro</option><option value="dark">Modo escuro</option></select></label>
          {([
            ["email_opt_in", "E-mail"], ["whatsapp_opt_in", "WhatsApp"], ["telegram_opt_in", "Telegram"], ["sms_opt_in", "SMS"],
          ] as const).map(([key, label]) => (
            <label className="preference-row" key={key}><span>{label}</span><Switch disabled={!authEnabled || busy} checked={preferences[key]} onCheckedChange={(value) => toggle(key, value)} aria-label={`Receber atualizações por ${label}`} /></label>
          ))}
          <small>Marcar um canal registra consentimento, mas não inicia envios antes de o respectivo serviço ser ativado.</small>
        </section>

        {billingActionsEnabled && <section className="account-danger-zone"><h2>Excluir conta</h2><p>A exclusão remove a conta e os dados de leitura. Assinaturas recorrentes são encerradas para impedir novas cobranças; registros fiscais estritamente necessários seguem os prazos legais.</p><label htmlFor="delete-confirmation">Digite EXCLUIR para confirmar</label><input id="delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /><Button variant="destructive" disabled={busy || confirmation !== "EXCLUIR"} onClick={deleteAccount}>Excluir minha conta</Button></section>}

        {message && <p className="auth-message" role="status">{message}</p>}
        <div className="account-footer-actions"><Link className="back-link" href="/">Voltar à revista</Link>{authEnabled && <Button variant="outline" onClick={signOut}><LogOut /> Sair</Button>}</div>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function questionStatus(value: string) {
  return ({ received: "Recebida", reviewing: "Em análise", answered: "Respondida", closed: "Encerrada" } as Record<string, string>)[value] ?? "Recebida";
}
