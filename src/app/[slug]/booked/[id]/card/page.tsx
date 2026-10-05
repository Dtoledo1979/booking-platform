import type { Metadata } from "next";
import Link from "next/link";
import { LocationShell } from "@/components/booking/location-shell";
import { buttonClasses } from "@/components/ui/button";
import { Card, Eyebrow } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Add a card", robots: { index: false } };

// docs/06 §5: card-on-file step for locations that charge cancellation
// fees. Placeholder until Stripe Elements is wired; unreachable today
// because no location has payouts connected yet.
export default async function CardStepPage({ params }: PageProps<"/[slug]/booked/[id]/card">) {
  const { slug, id } = await params;
  await requireUser(`/${slug}/booked/${id}/card`);

  return (
    <LocationShell slug={slug} name="" isPreview={false}>
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-12 sm:px-6">
        <Eyebrow>One last step</Eyebrow>
        <h1 className="font-display text-4xl leading-tight">Secure your booking with a card</h1>
        <Card className="flex flex-col gap-3">
          <p className="text-ink-soft">
            Your time is held for 10 minutes. Card details are handled by our payment provider — we never see or
            store your card number. You&apos;re only charged if you cancel late or miss the appointment.
          </p>
          <p className="text-sm text-muted">Card payments aren&apos;t available yet.</p>
        </Card>
        <Link href="/my-bookings" className={buttonClasses("secondary")}>
          My bookings
        </Link>
      </main>
    </LocationShell>
  );
}
