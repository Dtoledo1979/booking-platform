import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader, type NavItem } from "@/components/app/app-header";
import { buttonClasses } from "@/components/ui/button";
import { Badge, Card, Eyebrow } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { getMyAppointments, type MyAppointment } from "@/lib/my-appointments";
import { getMemberContext } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";
import { CancelButton } from "./cancel-button";

export const metadata: Metadata = { title: "My bookings" };

const STATUS: Record<MyAppointment["status"], { label: string; tone: "success" | "neutral" | "danger" | "warning" }> = {
  pending: { label: "Awaiting card", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  completed: { label: "Completed", tone: "neutral" },
  no_show: { label: "Missed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

function AppointmentCard({ a, upcoming }: { a: MyAppointment; upcoming: boolean }) {
  const tz = a.location_timezone;
  const now = new Date();
  const canChange = upcoming && a.location_is_public && new Date(a.free_until) > now;
  const status = STATUS[a.status];

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{formatDate(a.starts_at, tz)}</p>
          <p className="tabular font-mono text-sm">{formatTime(a.starts_at, tz)}</p>
        </div>
        <Badge tone={status.tone}>
          {a.status === "cancelled" && a.cancelled_by === "business" ? "Cancelled by business" : status.label}
        </Badge>
      </div>
      <div>
        <p className="font-display text-xl">{a.services}</p>
        <p className="text-sm text-ink-soft">
          {a.location_is_public ? (
            <Link href={`/${a.location_slug}`} className="underline underline-offset-2">
              {a.location_name}
            </Link>
          ) : (
            a.location_name
          )}
          {a.staff_name ? ` · with ${a.staff_name}` : ""} ·{" "}
          <span className="tabular font-mono">{formatMoney(a.price_cents, a.currency)}</span>
        </p>
        {a.fee_cents ? (
          <p className="mt-1 text-sm text-warning">
            Fee {a.fee_status === "succeeded" ? "charged" : "due"}:{" "}
            <span className="tabular font-mono">{formatMoney(a.fee_cents, a.currency)}</span>
          </p>
        ) : null}
      </div>
      {upcoming && (
        <div className="flex flex-wrap items-start gap-2 border-t border-line pt-4">
          {canChange && (
            <Link
              href={`/${a.location_slug}/book?service=${a.service_id}&reschedule=${a.appointment_id}`}
              className={buttonClasses("secondary", "sm")}
            >
              Change time
            </Link>
          )}
          <CancelButton appointmentId={a.appointment_id} />
          {!canChange && (
            <p className="w-full text-sm text-muted">
              It&apos;s too close to your appointment to change it online — contact the business if you need to.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export default async function MyBookingsPage() {
  const user = await requireUser("/my-bookings");
  const supabase = await createClient();
  const [appointments, ownerCtx] = await Promise.all([getMyAppointments(supabase), getMemberContext(supabase, user.id)]);

  const now = new Date();
  const upcoming = appointments
    .filter((a) => a.status === "confirmed" && new Date(a.starts_at) > now)
    .sort((x, y) => x.starts_at.localeCompare(y.starts_at));
  const past = appointments.filter((a) => !upcoming.includes(a));

  const nav: NavItem[] = ownerCtx
    ? [
        { href: "/my-bookings", label: "My bookings", current: true },
        { href: "/dashboard", label: "My business" },
      ]
    : [];

  return (
    <>
      <AppHeader homeHref="/my-bookings" nav={nav} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>My bookings</Eyebrow>
          <h1 className="font-display text-4xl leading-tight">Your appointments</h1>
        </div>

        <section className="flex flex-col gap-4" aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="font-display text-2xl">
            Upcoming
          </h2>
          {upcoming.length ? (
            upcoming.map((a) => <AppointmentCard key={a.appointment_id} a={a} upcoming />)
          ) : (
            <p className="text-muted">No upcoming appointments.</p>
          )}
        </section>

        {past.length > 0 && (
          <section className="flex flex-col gap-4" aria-labelledby="past-heading">
            <h2 id="past-heading" className="font-display text-2xl">
              Past & cancelled
            </h2>
            {past.map((a) => (
              <AppointmentCard key={a.appointment_id} a={a} upcoming={false} />
            ))}
          </section>
        )}
      </main>
    </>
  );
}
