import "server-only";

const BASE_URL = "https://api.mail.hostinger.com";
const SENDER = "adm@supersci-z.com";
const RECIPIENT = "adm@supersci-z.com";

function authorization() {
  const token = process.env.TOKEN_HOSTINGER_EMAIL?.trim();
  if (!token) throw new Error("editorial_mail_not_configured");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Read-only live check: validates the existing token without sending anything. */
export async function verifyEditorialMailbox() {
  const response = await fetch(`${BASE_URL}/api/v1/me`, {
    headers: authorization(), cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`editorial_mail_auth_${response.status}`);
  const body = await response.json() as {
    data?: { mailboxes?: Array<{ address?: string; resourceId?: string }> };
  };
  const mailbox = body.data?.mailboxes?.find((item) => item.address?.toLowerCase() === SENDER);
  if (!mailbox?.resourceId || !/^AC[A-Za-z0-9]+$/.test(mailbox.resourceId)) {
    throw new Error("editorial_mailbox_not_authorized");
  }
  return { address: SENDER, resourceId: mailbox.resourceId };
}

export type AlertDelivery =
  | { status: "sent"; provider: "hostinger"; httpStatus: 204; sentAt: string; correlationId: string | null; subject: string }
  | { status: "rejected"; provider: "hostinger"; httpStatus: number; subject: string }
  | { status: "unknown"; provider: "hostinger"; httpStatus: number | null; subject: string };

/**
 * Call only after a durable outbox claim has succeeded. Caller must persist the
 * result. Do not automatically retry unknown outcomes: reconcile INBOX.Sent by
 * the stable subject first; this API documents no idempotency-key mechanism.
 * Recipient is intentionally fixed to the owner's authorized alert address.
 */
export async function deliverEditorialAlert(input: {
  cycleId: string;
  eventId: string;
  summary: string;
  impact: string;
  nextAction: string;
}): Promise<AlertDelivery> {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.cycleId) || !uuid.test(input.eventId)) throw new Error("invalid_alert_id");
  for (const value of [input.summary, input.impact, input.nextAction]) {
    if (!value.trim() || value.length > 4000) throw new Error("invalid_alert_content");
  }
  // Fail safely before sending if the token does not manage the expected mailbox.
  const mailbox = await verifyEditorialMailbox();
  const subject = `[SUPER SCI-Z] Impedimento editorial — ${input.eventId}`;
  const text = [
    "Rafa Nascimento — acompanhamento editorial",
    `Ciclo: ${input.cycleId}`,
    `Ocorrência: ${input.summary}`,
    `Impacto: ${input.impact}`,
    `Próxima ação: ${input.nextAction}`,
    "Painel: https://supersci-z.com/gestao/editorial?agente=rafa_nascimento",
  ].join("\n\n");
  try {
    const response = await fetch(`${BASE_URL}/api/v1/mailboxes/${mailbox.resourceId}/send`, {
      method: "POST", headers: authorization(), cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ to: [RECIPIENT], subject, text, displayName: "SUPER SCI-Z — Rafa Nascimento" }),
    });
    if (response.status === 204) return {
      status: "sent", provider: "hostinger", httpStatus: 204,
      sentAt: new Date().toISOString(), correlationId: response.headers.get("x-correlation-id"), subject,
    };
    if ([400, 401, 403, 404, 422, 429].includes(response.status)) {
      return { status: "rejected", provider: "hostinger", httpStatus: response.status, subject };
    }
    return { status: "unknown", provider: "hostinger", httpStatus: response.status, subject };
  } catch {
    // A timeout may occur after the provider accepted the message.
    return { status: "unknown", provider: "hostinger", httpStatus: null, subject };
  }
}
