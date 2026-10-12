import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader, businessNav } from "@/components/app/app-header";
import { Badge, Card, Eyebrow } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatDate, formatTime } from "@/lib/format";
import { emailConfigured, smsConfigured } from "@/lib/notifications/providers";
import { can, getMemberContext } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";
import { MessageSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Messages" };

const KIND: Record<string, string> = {
  booking_confirmed: "Booking confirmation",
  booking_changed: "Booking changed",
  booking_cancelled: "Cancellation notice",
  reminder_free_window: "Reminder before free cancellation ends",
  reminder_upcoming: "Reminder 2 h before",
  business_new_booking: "New booking (to you)",
  business_cancelled: "Client cancelled (to you)",
};

const STATUS = {
  queued: { label: "Scheduled", tone: "neutral" },
  sending: { label: "Sending", tone: "warning" },
  sent: { label: "Sent", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Not sent", tone: "neutral" },
} as const;

export default async function MessagesPage() {
  const user = await requireUser("/dashboard/messages");
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");
  if (!can(ctx.role).manageBusiness) redirect("/dashboard/calendar");

  const [{ data: settings }, { data: messages }] = await Promise.all([
    supabase.from("locations").select("email_notifications, sms_notifications").eq("id", ctx.location.id).single(),
    supabase
      .from("notifications")
      .select("id, kind, channel, status, scheduled_for, sent_at, recipient, last_error, appointment_id")
      .eq("location_id", ctx.location.id)
      .order("scheduled_for", { ascending: false })
      .limit(100),
  ]);
  const tz = ctx.location.timezone;
  const providers = { email: emailConfigured(), sms: smsConfigured() };

  return (
    <>
      <AppHeader subtitle={ctx.location.name} nav={businessNav(ctx.location.slug, "messages", ctx.role)} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>Messages</Eyebrow>
          <h1 className="font-display text-4xl leading-tight">Reminders & notifications</h1>
          <p className="text-ink-soft">
            Sent automatically when bookings are made, changed or cancelled — and before each appointment, so clients
            can change plans while it&apos;s still free.
          </p>
        </div>

        {(!providers.email || !providers.sms) && (
          <p role="status" className="rounded-control bg-stone px-4 py-3 text-sm text-ink-soft">
            {!providers.email && !providers.sms
              ? "Email and SMS sending aren't connected yet. Messages are scheduled below and will go out once they are."
              : !providers.email
                ? "Email sending isn't connected yet; emails stay scheduled until it is."
                : "SMS sending isn't connected yet; texts stay scheduled until it is."}
          </p>
        )}

        <MessageSettingsForm email={settings?.email_notifications ?? true} sms={settings?.sms_notifications ?? true} />

        <section className="flex flex-col gap-3" aria-labelledby="log-heading">
          <h2 id="log-heading" className="font-display text-2xl">
            Recent and upcoming
          </h2>
          {messages?.length ? (
            <Card className="p-0 sm:p-0">
              <ul className="divide-y divide-line">
                {messages.map((m) => {
                  const status = STATUS[m.status];
                  const at = m.sent_at ?? m.scheduled_for;
                  return (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">
                          {KIND[m.kind] ?? m.kind} <span className="font-normal text-muted">· {m.channel === "sms" ? "SMS" : "Email"}</span>
                        </span>
                        <span className="block text-xs text-muted">
                          {formatDate(at, tz, "short")}, {formatTime(at, tz)}
                          {m.recipient ? ` · ${m.recipient}` : ""}
                          {m.status === "skipped" || m.status === "failed" ? ` · ${m.last_error ?? ""}` : ""}
                        </span>
                      </span>
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : (
            <p className="text-muted">No messages yet. They appear here as bookings come in.</p>
          )}
        </section>
      </main>
    </>
  );
}
