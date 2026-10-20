import type { EmailOtpType } from "@supabase/supabase-js";

const ALLOWED_EMAIL_OTP_TYPES = new Set([
  "email",
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
]);

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  configuracao: "A conexão segura não pôde ser concluída. Tente novamente em instantes.",
  link: "O link de acesso expirou, já foi utilizado ou não chegou completo. Solicite um novo acesso abaixo.",
  oauth: "O login social não foi concluído. Tente novamente.",
  perfil: "Sua conta foi autenticada, mas o perfil ainda está sendo preparado. Tente novamente em instantes.",
};

export function parseEmailOtpType(value: string | null): EmailOtpType | null {
  return value && ALLOWED_EMAIL_OTP_TYPES.has(value) ? value : null;
}

export function loginErrorMessage(value: string | null | undefined) {
  return value ? LOGIN_ERROR_MESSAGES[value] ?? "Não foi possível concluir o acesso. Solicite um novo código ou link." : "";
}

export function authSuccessPath(path: string, method: "email" | "google" | "apple") {
  const target = new URL(path, "https://app.local");
  target.searchParams.set("acesso", method);
  return `${target.pathname}${target.search}${target.hash}`;
}
