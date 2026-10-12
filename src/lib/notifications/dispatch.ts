import type { SupabaseClient } from "@supabase/supabase-js";
import { feeCents } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";
import { toNzMobileE164 } from "./phone";
import { emailConfigured, sendEmail, sendSms, smsConfigured, type SendResult } from "./providers";
import { renderEmail, renderSms, type MessageData, type MessageKind } from "./templates";

type Admin = SupabaseClient<Database>;
type Notification = Database["public"]["Tables"]["notifications"]["Row"];
type Status = Database["public"]["Enums"]["notification_status"];

const BUSINESS_KINDS = new Set<MessageKind>(["business_new_booking", "business_cancelled"]);
const REMINDERS = new Set<MessageKind>(["reminder_free_window", "reminder_upcoming"]);

export type DispatchSummary = { claimed: number; sent: number; skipped: number; failed: number; channels: string[] };

// Sends every due message for the configured channels. Safe to run often
// and in parallel: rows are claimed with SKIP LOCKED and sends are
// idempotent per notification id.
export async function dispatchDue(admin: Admin, siteUrl: string, limit = 50): Promise<DispatchSummary> {
  const channels = [emailConfigured() && "email", smsConfigured() && "sms"].filter(Boolean) as ("email" | "sms")[];
  const summary: DispatchSummary = { claimed: 0, sent: 0, skipped: 0, failed: 0, channels };
  if (!channels.length) return summary;

  const { data: claimed, error } = await admin.rpc("claim_notifications", { p_limit: limit, p_channels: channels });
  if (error) throw new Error(`claim_notifications failed: ${error.message}`);
  summary.claimed = claimed?.length ?? 0;

  for (const n of claimed ?? []) {
    let outcome: { status: Status; recipient?: string | null; id?: string | null; error?: string; retryable?: boolean };
    try {
      outcome = await deliver(admin, siteUrl, n);
    } catch (e) {
      outcome = { status: "failed", error: e instanceof Error ? e.message : String(e) };
    }
    await admin.rpc("complete_notification", {
      p_id: n.id,
      p_status: outcome.status,
      p_recipient: outcome.recipient ?? undefined,
      p_provider_message_id: outcome.id ?? undefined,
      p_error: outcome.error ?? undefined,
      p_retryable: outcome.retryable ?? true,
    });
    if (outcome.status === "sent") summary.sent++;
    else if (outcome.status === "skipped") summary.skipped++;
    else summary.failed++;
  }
  return summary;
}

async function deliver(admin: Admin, siteUrl: string, n: Notification) {
  const kind = n.kind as MessageKind;
  if (!n.appointment_id) return { status: "skipped" as const, error: "no appointment" };

  const { data: appt } = await admin
    .from("appointments")
    .select(
      "id, status, cancelled_by, cancellation_reason, policy_accepted_at, " +
        "location_clients(first_name, last_name, phone, email), " +
        "cancellation_policies(free_cancellation_hours, late_cancel_fee_type, late_cancel_fee_value), " +
        "locations(name, slug, timezone, currency, address_line, suburb, city, phone, email, organization_id), " +
        "appointment_services(service_name, starts_at, price_cents, staff(display_name))",
    )
    .eq("id", n.appointment_id)
    .maybeSingle();
  if (!appt) return { status: "skipped" as const, error: "appointment deleted" };

  type Row = {
    status: string;
    cancelled_by: "client" | "business" | "system" | null;
    cancellation_reason: string | null;
    policy_accepted_at: string | null;
    location_clients: { first_name: string; last_name: string | null; phone: string | null; email: string | null } | null;
    cancellation_policies: { free_cancellation_hours: number; late_cancel_fee_type: "none" | "fixed" | "percent"; late_cancel_fee_value: number } | null;
    locations: {
      name: string; slug: string; timezone: string; currency: string; address_line: string | null; suburb: string | null;
      city: string | null; phone: string | null; email: string | null; organization_id: string;
    } | null;
    appointment_services: { service_name: string; starts_at: string; price_cents: number; staff: { display_name: string } | null }[];
  };
  const a = appt as unknown as Row;
  const loc = a.locations;
  const client = a.location_clients;
  const lines = [...a.appointment_services].sort((x, y) => x.starts_at.localeCompare(y.starts_at));
  if (!loc || !client || !lines.length) return { status: "skipped" as const, error: "incomplete appointment" };

  const startsAt = lines[0].starts_at;
  // A reminder is only valid for the time it was scheduled for (dedupe key
  // ends with that start's epoch) and only while still confirmed.
  if (REMINDERS.has(kind)) {
    const epoch = String(Math.round(Date.parse(startsAt) / 1000));
    if (a.status !== "confirmed" || !n.dedupe_key.endsWith(`:${epoch}`)) {
      return { status: "skipped" as const, error: "appointment changed" };
    }
  }

  const price = lines.reduce((s, l) => s + l.price_cents, 0);
  const policy = a.cancellation_policies;
  const lateFee =
    policy && a.policy_accepted_at ? feeCents(policy.late_cancel_fee_type, policy.late_cancel_fee_value, price) : 0;
  const freeUntil =
    policy && lateFee > 0
      ? new Date(Date.parse(startsAt) - policy.free_cancellation_hours * 3600_000).toISOString()
      : null;
  const { data: fee } = await admin
    .from("booking_fees")
    .select("amount_cents")
    .eq("appointment_id", n.appointment_id)
    .eq("kind", "late_cancel")
    .maybeSingle();

  const data: MessageData = {
    siteUrl,
    location: {
      name: loc.name,
      slug: loc.slug,
      timezone: loc.timezone,
      currency: loc.currency,
      address: [loc.address_line, loc.suburb, loc.city].filter(Boolean).join(", ") || null,
      phone: loc.phone,
    },
    client: {
      firstName: client.first_name,
      fullName: [client.first_name, client.last_name].filter(Boolean).join(" "),
      phone: client.phone,
      email: client.email,
    },
    appointment: {
      services: lines.map((l) => l.service_name).join(", "),
      staffName: lines[0].staff?.display_name ?? null,
      startsAt,
      priceCents: price,
      freeUntil,
      lateFeeCents: lateFee,
      cancelledBy: a.cancelled_by,
      cancellationReason: a.cancellation_reason,
      feeChargedCents: fee?.amount_cents ?? 0,
    },
  };

  let result: SendResult;
  let recipient: string | null;

  if (n.channel === "sms") {
    recipient = toNzMobileE164(client.phone);
    const body = renderSms(kind, data);
    if (!recipient) return { status: "skipped" as const, error: "no NZ mobile number" };
    if (!body) return { status: "skipped" as const, error: "no SMS for this message" };
    result = await sendSms({ to: recipient, body });
  } else {
    recipient = BUSINESS_KINDS.has(kind) ? (loc.email ?? (await ownerEmail(admin, loc.organization_id))) : client.email;
    const email = renderEmail(kind, data);
    if (!recipient) return { status: "skipped" as const, error: "no email address" };
    if (!email) return { status: "skipped" as const, error: "no email for this message" };
    result = await sendEmail({
      to: recipient,
      ...email,
      fromName: BUSINESS_KINDS.has(kind) ? undefined : loc.name,
      replyTo: BUSINESS_KINDS.has(kind) ? client.email : loc.email,
      idempotencyKey: n.id,
    });
  }

  return result.ok
    ? { status: "sent" as const, recipient, id: result.id }
    : { status: "failed" as const, recipient, error: result.error, retryable: result.retryable };
}

async function ownerEmail(admin: Admin, organizationId: string) {
  const { data: org } = await admin.from("organizations").select("owner_user_id").eq("id", organizationId).single();
  if (!org) return null;
  const { data } = await admin.auth.admin.getUserById(org.owner_user_id);
  return data.user?.email ?? null;
}
