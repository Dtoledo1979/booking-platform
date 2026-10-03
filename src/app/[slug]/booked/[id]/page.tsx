import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocationShell } from "@/components/booking/location-shell";
import { buttonClasses } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatDate, formatMoney, formatTime } from "@/lib/format";
import { getMyAppointments, googleCalendarUrl } from "@/lib/my-appointments";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Booking confirmed", robots: { index: false } };

export default async function BookedPage({ params, searchParams }: PageProps<"/[slug]/booked/[id]">) {
  const { slug, id } = await params;
  const changed = (await searchParams).changed === "1";
  await requireUser(`/${slug}/booked/${id}`);
  const supabase = await createClient();
  const appointment = (await getMyAppointments(supabase)).find((a) => a.appointment_id === id);
  if (!appointment) notFound();

  const tz = appointment.location_timezone;
  const freeUntil = new Date(appointment.free_until);

  return (
    <LocationShell slug={slug} name={appointment.location_name} isPreview={false}>
      <main className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-3">
          <Eyebrow>{changed ? "Booking updated" : "You're booked"}</Eyebrow>
          <h1 className="font-display text-5xl leading-none">
            {changed ? "New time confirmed." : "See you soon."}
          </h1>
        </div>

        <Card className="flex flex-col gap-4">
          <div>
            <p className="font-display text-2xl">{appointment.services}</p>
            <p className="text-ink-soft">
              {appointment.location_name}
              {appointment.staff_name ? ` · with ${appointment.staff_name}` : ""}
            </p>
          </div>
          <div className="rounded-control bg-stone px-4 py-3">
            <p className="font-medium">{formatDate(appointment.starts_at, tz)}</p>
            <p className="tabular font-mono">
              {formatTime(appointment.starts_at, tz)} – {formatTime(appointment.ends_at, tz)}
            </p>
          </div>
          <p className="tabular font-mono text-sm">{formatMoney(appointment.price_cents, appointment.currency)}</p>
          <p className="text-sm text-ink-soft">
            {freeUntil > new Date()
              ? `Free to cancel or change until ${formatDate(freeUntil, tz, "short")}, ${formatTime(freeUntil, tz)}.`
              : "This booking is inside the cancellation window; late changes may incur a fee."}
          </p>
        </Card>

        <div className="flex flex-wrap gap-3">
          <a href={googleCalendarUrl(appointment)} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary")}>
            Add to Google Calendar
          </a>
          <Link href="/my-bookings" className={buttonClasses("primary")}>
            My bookings
          </Link>
        </div>
      </main>
    </LocationShell>
  );
}
