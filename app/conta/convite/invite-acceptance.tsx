"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function InviteAcceptance({ token }: { token: string }) {
  const router = useRouter();
  useEffect(() => {
    if (/^[A-Za-z0-9_-]{43}$/.test(token)) window.history.replaceState(window.history.state, "", "/conta/convite");
  }, [token]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    const response = await fetch("/api/account/household/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (response.ok) {
      router.replace("/conta?acesso=cosmos");
      router.refresh();
      return;
    }
    setMessage("Este convite é inválido, expirou ou pertence a outro e-mail.");
    setBusy(false);
  }

  return <><Button disabled={busy || !/^[A-Za-z0-9_-]{43}$/.test(token)} onClick={accept}>Aceitar acesso Cosmos</Button>{message && <p className="auth-message" role="status">{message}</p>}</>;
}
