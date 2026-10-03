import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocationShell } from "@/components/booking/location-shell";
import { Eyebrow } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { localDateKey } from "@/lib/format";
import { getPublicLocation } from "@/lib/public-location";
import { BookingFlow } from "./booking-flow";

export const metadata: Metadata = { title: "Book", robots: { index: false } };

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);

export default async function BookPage({ params, searchParams }: PageProps<"/[slug]/book">) {
  const { slug } = await params;
  const query = await searchParams;
  const data = await getPublicLocation(slug);
  if (!data) notFound();

  const { location, isPreview, services, staff, staffServices, policy } = data;
  const service = services.find((s) => s.id === param(query.service));
  if (!service) notFound();

  const eligible = staff.filter((m) => staffServices.some((l) => l.staff_id === m.id && l.service_id === service.id));
  const requestedStaff = param(query.staff);
  const rescheduleId = param(query.reschedule);
  const user = await getCurrentUser();

  return (
    <LocationShell slug={slug} name={location.name} isPreview={isPreview}>
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-3">
          <Link href={`/${slug}`} className="text-sm text-muted hover:text-ink">
            ← All services
          </Link>
          <Eyebrow>{rescheduleId ? "Change your booking" : "Book an appointment"}</Eyebrow>
          <h1 className="font-display text-4xl leading-tight">{service.name}</h1>
        </div>
        <BookingFlow
          slug={slug}
          location={{
            id: location.id,
            name: location.name,
            timezone: location.timezone,
            currency: location.currency,
            maxAdvanceDays: location.max_advance_days,
          }}
          service={service}
          staff={eligible.map((m) => ({ id: m.id, display_name: m.display_name }))}
          policy={policy}
          isPreview={isPreview}
          signedIn={Boolean(user)}
          today={localDateKey(new Date(), location.timezone)}
          initial={{
            staffId: eligible.some((m) => m.id === requestedStaff) ? requestedStaff : null,
            start: param(query.start),
          }}
          rescheduleId={rescheduleId}
        />
      </main>
    </LocationShell>
  );
}
