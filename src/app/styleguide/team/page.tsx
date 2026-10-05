import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InviteForm } from "@/app/dashboard/team/invite-form";
import { StaffForm } from "@/app/dashboard/team/staff-form";
import { Eyebrow } from "@/components/ui/card";

export const metadata: Metadata = { title: "Team preview", robots: { index: false } };

// Team screens with sample data, reviewable without signing in.
// Development only; forms are not submitted.
export default function TeamPreview() {
  if (process.env.NODE_ENV !== "development") notFound();

  const services = [
    { id: "s1", name: "Skin fade", duration_minutes: 45, price_cents: 5500 },
    { id: "s2", name: "Cut & blow-dry", duration_minutes: 60, price_cents: 8500 },
    { id: "s3", name: "Gel manicure", duration_minutes: 60, price_cents: 7000 },
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-12 px-4 py-12 sm:px-6">
      <section className="flex flex-col gap-4">
        <Eyebrow>Edit team member</Eyebrow>
        <StaffForm
          currency="NZD"
          services={services}
          staff={{
            id: "preview",
            displayName: "Rangi",
            bio: "Fades & beard work",
            calendarColor: "#5f7a6a",
            bookableOnline: true,
            serviceIds: ["s1", "s2"],
            hours: { 2: ["10:00", "18:00"], 3: ["10:00", "18:00"], 4: ["12:00", "20:00"], 5: ["10:00", "18:00"], 6: ["09:00", "15:00"] },
          }}
        />
      </section>
      <section className="flex flex-col gap-4">
        <Eyebrow>Invite someone</Eyebrow>
        <InviteForm canInviteManagers unlinkedStaff={[{ id: "preview", display_name: "Rangi" }]} />
      </section>
    </main>
  );
}
