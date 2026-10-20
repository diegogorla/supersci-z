"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

const email = "adm@supersci-z.com";

function copyWithFallback(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  return copied ? Promise.resolve() : Promise.reject(new Error("copy_failed"));
}

export function ContactEmailActions({ subject }: { subject: string }) {
  const [message, setMessage] = useState("");
  const encodedEmail = encodeURIComponent(email);
  const encodedSubject = encodeURIComponent(subject);
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodedEmail}&su=${encodedSubject}`;
  const outlook = `https://outlook.office.com/mail/deeplink/compose?to=${encodedEmail}&subject=${encodedSubject}`;

  async function copyEmail() {
    try {
      await copyWithFallback(email);
      setMessage("Endereço copiado: adm@supersci-z.com");
    } catch {
      setMessage("Copie manualmente: adm@supersci-z.com");
    }
  }

  return (
    <div className="contact-actions">
      <button className="legal-action" type="button" onClick={copyEmail}>
        {message.startsWith("Endereço copiado") ? <Check /> : <Copy />} Copiar e-mail
      </button>
      <a href={gmail} target="_blank" rel="noreferrer"><ExternalLink /> Abrir Gmail</a>
      <a href={outlook} target="_blank" rel="noreferrer"><ExternalLink /> Abrir Outlook</a>
      <small role="status">{message || "Escolha seu webmail ou copie o endereço — não é necessário ter um aplicativo de e-mail instalado."}</small>
    </div>
  );
}
