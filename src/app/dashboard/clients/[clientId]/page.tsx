import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader, businessNav } from "@/components/app/app-header";
import { buttonClasses } from "@/components/ui/button";
import { Badge, Card, Eyebrow } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { can, getMemberContext } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";
import { BlockForm, ClientForm } from "../client-form";

export const metadata: Metadata = { title: "Client" };

const STATUS = {
  pending: { label: "Awaiting card", tone: "warning" },
  confirmed: { label: "Upcoming", tone: "success" },
  completed: { label: "Completed", tone: "neutral" },
  no_show: { label: "No-show", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
} as const;

export default async function ClientPage({ params }: PageProps<"/dashboard/clients/[clientId]">) {
  const { clientId } = await params;
  const user = await requireUser(`/dashboard/clients/${clientId}`);
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");
  if (!can(ctx.role).seeAllCalendars) redirect("/dashboard/calendar");

  const { data: client } = await supabase
    .from("location_clients")
    .select("id, first_name, last_name, phone, email, allergies, notes, is_blocked, blocked_reason, user_id, created_at")
    .eq("id", clientId)
    .eq("location_id", ctx.location.id)
    .maybeSingle();
  if (!client) notFound();

  const [{ data: history }, { data: fees }, { data: summary }, { data: location }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, status, cancelled_by, appointment_services(service_name, starts_at, price_cents, staff(display_name))")
      .eq("location_client_id", client.id),
    supabase.from("booking_fees").select("id, appointment_id, kind, amount_cents, status").eq("location_client_id", client.id),
    supabase.rpc("location_client_summaries", { p_location_id: ctx.location.id, p_search: undefined, p_limit: 1000 }),
    supabase.from("locations").select("currency").eq("id", ctx.location.id).single(),
  ]);
  const stats = summary?.find((s) => s.id === client.id);
  const tz = ctx.location.timezone;
  const currency = location?.currency ?? "NZD";

  const visits = (history ?? [])
    .map((a) => {
      const lines = [...a.appointment_services].sort((x, y) => x.starts_at.localeCompare(y.starts_at));
      return {
        id: a.id,
        status: a.status,
        cancelledBy: a.cancelled_by,
        startsAt: lines[0]?.starts_at ?? "",
        services: lines.map((l) => l.service_name).join(", "),
        staff: lines[0]?.staff?.display_name ?? null,
        price: lines.reduce((s, l) => s + l.price_cents, 0),
        fees: (fees ?? []).filter((f) => f.appointment_id === a.id),
      };
    })
    .filter((v) => v.startsAt)
    .sort((x, y) => y.startsAt.localeCompare(x.startsAt));
  const name = [client.first_name, client.last_name].filter(Boolean).join(" ");

  return (
    <>
      <AppHeader subtitle={ctx.location.name} nav={businessNav(ctx.location.slug, "clients", ctx.role)} />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-3">
          <Link href="/dashboard/clients" className="text-sm text-muted hover:text-ink">
            ← Clients
          </Link>
          <Eyebrow>Client</Eyebrow>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl leading-tight">{name}</h1>
            {client.is_blocked && <Badge tone="danger">Blocked</Badge>}
            {client.user_id && <Badge tone="brass">Has an account</Badge>}
          </div>
          {client.allergies && (
            <p role="note" className="rounded-control bg-warning/10 px-4 py-3 text-sm text-warning">
              <strong>Allergies:</strong> {client.allergies}
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Visits", String(stats?.visits ?? 0)],
            ["No-shows", String(stats?.no_shows ?? 0)],
            ["Late cancellations", String(stats?.late_cancellations ?? 0)],
            ["Fees due", formatMoney(stats?.fees_due_cents ?? 0, currency)],
          ].map(([label, value]) => (
            <Card key={label} className="p-4 sm:p-4">
              <dt className="text-xs uppercase tracking-[0.14em] text-muted">{label}</dt>
              <dd className="tabular mt-1 font-display text-3xl">{value}</dd>
            </Card>
          ))}
        </dl>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="flex flex-col gap-3" aria-labelledby="history-heading">
            <div className="flex items-center justify-between">
              <h2 id="history-heading" className="font-display text-2xl">
                Appointments
              </h2>
              <Link href={`/dashboard/calendar?panel=new`} className={buttonClasses("secondary", "sm")}>
                Book
              </Link>
            </div>
            {visits.length ? (
              <Card className="p-0 sm:p-0">
                <ul className="divide-y divide-line">
                  {visits.map((v) => {
                    const status = STATUS[v.status];
                    const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(v.startsAt));
                    return (
                      <li key={v.id}>
                        <Link
                          href={`/dashboard/calendar?date=${date}&appt=${v.id}`}
                          className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-stone"
                        >
                          <span className="min-w-0">
                            <span className="block font-medium">{v.services}</span>
                            <span className="block text-sm text-muted">
                              {formatDate(v.startsAt, tz, "short")}, {formatTime(v.startsAt, tz)}
                              {v.staff ? ` · ${v.staff}` : ""} · {formatMoney(v.price, currency)}
                            </span>
                            {v.fees.map((f) => (
                              <span key={f.id} className="block text-xs text-warning">
                                {f.kind === "no_show" ? "No-show" : "Late cancellation"} fee {formatMoney(f.amount_cents, currency)} · {f.status}
                              </span>
                            ))}
                          </span>
                          <Badge tone={status.tone}>
                            {v.status === "cancelled" && v.cancelledBy === "business" ? "Cancelled by you" : status.label}
                          </Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ) : (
              <p className="text-muted">No appointments yet.</p>
            )}
          </section>

          <aside className="flex flex-col gap-4">
            <BlockForm clientId={client.id} blocked={client.is_blocked} reason={client.blocked_reason} />
            <p className="text-xs text-muted">
              Client since {formatDate(client.created_at, tz, "short")}.
            </p>
          </aside>
        </div>

        <section className="flex flex-col gap-3" aria-labelledby="details-heading">
          <h2 id="details-heading" className="font-display text-2xl">
            Details
          </h2>
          <ClientForm client={client} hasAccount={Boolean(client.user_id)} />
        </section>
      </main>
    </>
  );
}
