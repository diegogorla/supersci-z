import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeAdminReturnPath } from "@/lib/security/admin-return-path";
import { AdminLoginPanel } from "./admin-login-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Acesso administrativo | SUPER SCI-Z",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeAdminReturnPath((await searchParams).next);
  return <AdminLoginPanel configured={isSupabaseConfigured()} next={next} />;
}
