import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusinessStep } from "@/app/onboarding/business-step";
import { HoursStep } from "@/app/onboarding/hours-step";
import { ServicesStep } from "@/app/onboarding/services-step";
import { Eyebrow } from "@/components/ui/card";

export const metadata: Metadata = { title: "Onboarding preview", robots: { index: false } };

// Renders each onboarding step with sample data so the screens can be
// reviewed without signing in. Development only; forms are not submitted.
export default function OnboardingPreview() {
  if (process.env.NODE_ENV !== "development") notFound();

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-14 px-4 py-12 sm:px-6">
      <section className="flex flex-col gap-4">
        <Eyebrow>Step 1 · Your business</Eyebrow>
        <BusinessStep host="localhost:3000" />
      </section>
      <section className="flex flex-col gap-4">
        <Eyebrow>Step 2 · Services</Eyebrow>
        <ServicesStep
          services={[
            { id: "1", name: "Skin fade", duration_minutes: 45, price_cents: 5500 },
            { id: "2", name: "Gel manicure", duration_minutes: 60, price_cents: 7000 },
          ]}
        />
      </section>
      <section className="flex flex-col gap-4">
        <Eyebrow>Step 3 · Opening hours</Eyebrow>
        <HoursStep hours={[]} ownerWorks />
      </section>
    </main>
  );
}
