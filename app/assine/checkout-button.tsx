"use client";

import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import type { PaddlePlanCode } from "@/lib/paddle/config";

type CheckoutResponse = {
  transactionId: string;
  clientToken: string;
  environment: "sandbox" | "live";
  priceId: string;
  checkoutReference: string;
  customerEmail: string;
  paddleCustomerId: string | null;
  successUrl: string;
  allowedPaymentMethods: string[] | null;
};

type CheckoutErrorResponse = {
  error?: "owner_preview_active" | "forbidden" | "invalid_plan" | "authentication_required" | "not_configured" | "checkout_not_configured" | "intent_failed" | "already_subscribed" | "checkout_in_progress" | "account_deletion_pending" | "checkout_preparing" | "checkout_reconciliation_required";
};

const checkoutErrorMessage: Record<NonNullable<CheckoutErrorResponse["error"]>, string> = {
  owner_preview_active: "Volte ao modo proprietário antes de abrir um pagamento.",
  already_subscribed: "Sua conta já tem um plano. Gerencie a assinatura existente em Minha conta.",
  checkout_in_progress: "Há um pagamento em preparação para outro plano. Conclua ou encerre esse pagamento antes de iniciar outro.",
  account_deletion_pending: "Sua conta tem uma solicitação de exclusão em andamento.",
  checkout_preparing: "O pagamento já está sendo preparado. Aguarde alguns instantes e tente abrir novamente.",
  checkout_reconciliation_required: "A preparação deste pagamento precisa ser conferida. Não inicie outra compra; contate adm@supersci-z.com.",
  forbidden: "A solicitação de pagamento foi recusada por segurança. Recarregue a página e tente novamente.",
  invalid_plan: "Este plano não está disponível. Recarregue a página para atualizar os preços.",
  authentication_required: "Sua sessão expirou. Entre novamente para continuar.",
  not_configured: "O checkout ainda não está liberado para esta conta.",
  checkout_not_configured: "A configuração segura deste plano ainda não está completa.",
  intent_failed: "Não foi possível preparar o pagamento no banco. Nenhuma cobrança foi feita.",
};

type PaddleClientStage = "script_load" | "initialize" | "checkout_open";

type PaddleEvent = {
  name?: string;
  code?: string;
};

type PaddleWindow = Window & {
  Paddle?: {
    Environment: { set(value: "sandbox"): void };
    Initialize(options: {
      token: string;
      pwCustomer?: { id?: string };
      eventCallback?: (event: PaddleEvent) => void;
    }): void;
    Checkout: { open(options: Record<string, unknown>): void };
  };
};

let paddlePromise: Promise<NonNullable<PaddleWindow["Paddle"]>> | null = null;
let paddleInitialized = false;
let activeCheckoutErrorHandler: ((stage: PaddleClientStage, code: string) => void) | null = null;

function reportPaddleClientError(stage: PaddleClientStage, code: string) {
  const safeCode = /^[a-z0-9_-]{1,64}$/i.test(code) ? code : "unknown";
  void fetch("/api/paddle/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage, code: safeCode }),
    keepalive: true,
  }).catch(() => undefined);
}

function loadPaddle() {
  if (paddlePromise) return paddlePromise;
  paddlePromise = new Promise<NonNullable<PaddleWindow["Paddle"]>>((resolve, reject) => {
    const current = (window as PaddleWindow).Paddle;
    if (current) return resolve(current);
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    const timeout = window.setTimeout(() => reject(new Error("script_timeout")), 15000);
    script.onload = () => {
      window.clearTimeout(timeout);
      const paddle = (window as PaddleWindow).Paddle;
      if (paddle) resolve(paddle); else reject(new Error("Paddle.js unavailable"));
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("script_blocked"));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    paddlePromise = null;
    throw error;
  });
  return paddlePromise;
}

export function CheckoutButton({ plan, ready, signedIn, children }: { plan: PaddlePlanCode; ready: boolean; signedIn: boolean; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function openCheckout() {
    if (!signedIn) {
      // Full navigation unloads any public advertising or analytics code before authentication.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/entrar?next=${encodeURIComponent("/assine")}`);
      return;
    }
    if (!ready) {
      setMessage("O checkout seguro está temporariamente indisponível. Nenhuma cobrança foi iniciada.");
      return;
    }
    setBusy(true);
    setMessage("");
    let stage: PaddleClientStage = "script_load";
    const handleClientError = (failedStage: PaddleClientStage, code: string) => {
      reportPaddleClientError(failedStage, code);
      if (failedStage === "script_load") {
        setMessage("O módulo seguro do Paddle não carregou. Recarregue a página e tente novamente.");
      } else if (failedStage === "initialize") {
        setMessage("O Paddle recusou o token público deste ambiente. Nenhuma cobrança foi feita.");
      } else {
        setMessage(`O Paddle recusou a abertura do checkout (código: ${code}). Nenhuma cobrança foi feita.`);
      }
    };
    activeCheckoutErrorHandler = handleClientError;
    try {
      const response = await fetch("/api/paddle/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (response.status === 401) {
        // Full navigation unloads any public advertising or analytics code before authentication.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/entrar?next=${encodeURIComponent("/assine")}`);
        return;
      }
      if (!response.ok) {
        const failure = await response.json().catch(() => ({})) as CheckoutErrorResponse;
        setMessage(failure.error && checkoutErrorMessage[failure.error]
          ? checkoutErrorMessage[failure.error]
          : "Não foi possível abrir o pagamento agora. Nenhuma cobrança foi feita.");
        return;
      }
      const checkout = await response.json() as CheckoutResponse;
      stage = "script_load";
      const paddle = await loadPaddle();
      if (!paddleInitialized) {
        stage = "initialize";
        if (checkout.environment === "sandbox") paddle.Environment.set("sandbox");
        paddle.Initialize({
          token: checkout.clientToken,
          eventCallback: (event) => {
            if (event.name === "checkout.error") {
              activeCheckoutErrorHandler?.("checkout_open", event.code || "checkout_error");
            }
          },
          ...(checkout.environment === "live" ? {
            pwCustomer: checkout.paddleCustomerId ? { id: checkout.paddleCustomerId } : {},
          } : {}),
        });
        paddleInitialized = true;
      }
      stage = "checkout_open";
      paddle.Checkout.open({
        transactionId: checkout.transactionId,
        customer: { email: checkout.customerEmail },

        settings: {
          displayMode: "overlay",
          variant: "one-page",
          theme: "light",
          locale: "pt-BR",
          allowLogout: false,
          ...(checkout.allowedPaymentMethods ? { allowedPaymentMethods: checkout.allowedPaymentMethods } : {}),
          successUrl: checkout.successUrl,
        },
      });
    } catch (error) {
      const code = error instanceof Error && /^[a-z0-9_-]{1,64}$/i.test(error.message)
        ? error.message
        : `${stage}_failed`;
      handleClientError(stage, code);
    } finally {
      setBusy(false);
    }
  }

  return <div className="checkout-action"><button type="button" onClick={openCheckout} disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <ArrowRight />}{children}</button>{message && <small role="status">{message}</small>}</div>;
}
