import type { Metadata } from "next";
import { LoginPanel } from "./login-panel";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { loginErrorMessage } from "@/lib/supabase/email-auth";
import { safeReturnPath } from "@/lib/security/return-path";

export const metadata: Metadata = {
  title: "Entrar | SUPER SCI-Z",
  description: "Entre na SUPER SCI-Z para acompanhar sua cota de leitura e preferências.",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  return <LoginPanel
    configured={isSupabaseConfigured()}
    next={next}
    initialMessage={loginErrorMessage(params.erro)}
    googleEnabled={process.env.SUPABASE_GOOGLE_ENABLED === "true"}
    appleEnabled={process.env.SUPABASE_APPLE_ENABLED === "true"}
    emailAuthMode={process.env.SUPABASE_EMAIL_AUTH_MODE === "otp" ? "otp" : "magiclink"}
  />;
}
