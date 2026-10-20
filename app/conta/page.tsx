import { OwnerPreviewAccount } from "../owner-preview-account";
import { getOwnerPreview } from "@/lib/owner-preview/server";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountPanel } from "./account-panel";
import { readerDisplayName } from "@/lib/account/display";
import { getAuthenticatedAccountContext } from "@/lib/account/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isMembershipRuntimeReady } from "@/lib/supabase/server-config";
import { getPaddleEnvironment } from "@/lib/paddle/config";
import { isPaddleControlledTestRuntimeReady } from "@/lib/paddle/test-access";
import { hashReaderDevice, READER_COOKIE, verifyReaderCookie } from "@/lib/security/reader-cookie";
import { deviceLabel } from "@/lib/security/device-label";

export const metadata: Metadata = { title: "Minha conta | SUPER SCI-Z", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ acesso?: string }> }) {
  const params = await searchParams;
  const accessConfirmed = ["email", "google", "apple", "cosmos"].includes(params.acesso ?? "");
  if (!isSupabaseConfigured()) {
    return <AccountPanel accessConfirmed={false} authEnabled={false} billingActionsEnabled={false} displayName="" email="" preferences={null} credits={null} subscription={null} entitlement={null} householdMembers={[]} devices={[]} questions={[]} authority="reader" moderationComments={[]} moderationQuestions={[]} />;
  }

  const context = await getAuthenticatedAccountContext();
  if (!context) redirect("/entrar?next=/conta");
  const { supabase, user, effective, authority } = context;
  const preview = await getOwnerPreview();
  const environment = getPaddleEnvironment();

  const [profileResult, preferencesResult, allowanceResult, subscriptionResult] = await Promise.all([
    supabase.from("reader_profiles").select("user_id").eq("user_id", user.id).maybeSingle(),
    supabase.from("communication_preferences").select("email_opt_in,whatsapp_opt_in,telegram_opt_in,sms_opt_in").eq("user_id", user.id).maybeSingle(),
    supabase.rpc("get_my_reading_allowance_v2", { p_provider_environment: environment }),
    supabase.from("subscriptions")
      .select("plan_code,status,trial_ends_at,current_period_end,cancel_at_period_end,provider,provider_subscription_id,created_at")
      .eq("user_id", user.id)
      .eq("provider_environment", environment)
      .in("status", ["trialing", "active", "past_due", "paused"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!profileResult.data) redirect("/entrar?erro=perfil");

  let credits = typeof allowanceResult.data === "number" ? allowanceResult.data : null;
  if (allowanceResult.error) {
    const fallback = await supabase.rpc("get_my_reading_allowance");
    credits = typeof fallback.data === "number" ? fallback.data : null;
  }

  const admin = createAdminSupabaseClient();
  const email = user.email ?? "";
  const memberRows = effective.ownerUserId === user.id
    ? (await admin.from("household_members")
      .select("id,member_email_hint,status,accepted_user_id,accepted_at")
      .eq("owner_user_id", user.id)
      .neq("status", "revoked")
      .order("created_at")).data ?? []
    : [];
  const groupUserIds = effective.ownerUserId === user.id
    ? [user.id, ...memberRows.filter((row) => row.status === "active" && row.accepted_user_id).map((row) => row.accepted_user_id as string)]
    : [user.id];
  const cookieStore = await cookies();
  const currentReaderId = await verifyReaderCookie(cookieStore.get(READER_COOKIE)?.value);
  const currentDeviceHash = await hashReaderDevice(currentReaderId);
  if (
    currentDeviceHash
    && !preview
    && effective.accessTier !== "free"
    && (isMembershipRuntimeReady() || isPaddleControlledTestRuntimeReady(email))
  ) {
    const requestHeaders = await headers();
    await admin.rpc("register_access_device", {
      p_user_id: user.id,
      p_device_hash: currentDeviceHash,
      p_device_label: deviceLabel(requestHeaders.get("user-agent")),
      p_provider_environment: environment,
    });
  }
  const canModerate = authority === "editor" || authority === "admin";
  const [deviceResult, questionResult, moderationCommentResult, moderationQuestionResult] = await Promise.all([
    admin.from("access_devices")
      .select("id,user_id,label,last_seen_at,device_hash")
      .in("user_id", groupUserIds)
      .is("revoked_at", null)
      .order("last_seen_at", { ascending: false }),
    admin.from("editorial_questions")
      .select("id,body,priority,status,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
    canModerate
      ? admin.from("article_comments")
        .select("id,article_slug,author_display_name,body,status,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(50)
      : Promise.resolve({ data: [] }),
    canModerate
      ? admin.from("editorial_questions")
        .select("id,body,priority,status,created_at")
        .in("status", ["received", "reviewing"])
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <><OwnerPreviewAccount /><AccountPanel
      accessConfirmed={accessConfirmed}
      authEnabled
      billingActionsEnabled={!effective.sharedAccess && (isMembershipRuntimeReady() || isPaddleControlledTestRuntimeReady(email))}
      displayName={readerDisplayName(user.user_metadata, email)}
      email={email}
      preferences={preferencesResult.data}
      credits={credits}
      subscription={subscriptionResult.data ? {
        plan_code: subscriptionResult.data.plan_code, status: subscriptionResult.data.status,
        trial_ends_at: subscriptionResult.data.trial_ends_at, current_period_end: subscriptionResult.data.current_period_end,
        cancel_at_period_end: subscriptionResult.data.cancel_at_period_end, provider: subscriptionResult.data.provider,
        hasBillingReference: Boolean(subscriptionResult.data.provider_subscription_id), created_at: subscriptionResult.data.created_at,
      } : null}
      entitlement={{
        access_tier: effective.accessTier,
        source: effective.source,
        valid_from: new Date().toISOString(),
        valid_until: effective.validUntil,
        revoked_at: null,
        ads_enabled: effective.adsEnabled,
        device_limit: effective.deviceLimit,
        household_slots: effective.householdSlots,
        provider_environment: effective.providerEnvironment,
        shared_access: effective.sharedAccess,
      }}
      householdMembers={memberRows.map((row) => ({ id: row.id, emailHint: row.member_email_hint ?? "e-mail convidado", status: row.status, acceptedAt: row.accepted_at }))}
      devices={(deviceResult.data ?? []).map((row) => ({ id: row.id, label: row.label ?? "Navegador", lastSeenAt: row.last_seen_at, current: Boolean(currentDeviceHash && row.device_hash === currentDeviceHash), own: row.user_id === user.id }))}
      questions={(questionResult.data ?? []).map((row) => ({ id: row.id, body: row.body, priority: row.priority, status: row.status, createdAt: row.created_at }))}
      authority={authority}
      moderationComments={(moderationCommentResult.data ?? []).map((row) => ({ id: row.id, articleSlug: row.article_slug, author: row.author_display_name, body: row.body, status: row.status, createdAt: row.created_at }))}
      moderationQuestions={(moderationQuestionResult.data ?? []).map((row) => ({ id: row.id, body: row.body, priority: row.priority, status: row.status, createdAt: row.created_at }))}
    /></>
  );
}
