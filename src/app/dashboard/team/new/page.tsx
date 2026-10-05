import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader, businessNav } from "@/components/app/app-header";
import { windowsFromRows } from "@/components/app/week-hours-fields";
import { Eyebrow } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { can, getMemberContext } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";
import { StaffForm } from "../staff-form";

export const metadata: Metadata = { title: "Add team member" };

export default async function NewStaffPage() {
  const user = await requireUser("/dashboard/team/new");
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");
  if (!can(ctx.role).manageBusiness) redirect("/dashboard/calendar");

  const [{ data: services }, { data: opening }, { data: location }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, duration_minutes, price_cents")
      .eq("location_id", ctx.location.id)
      .eq("active", true)
      .order("sort_order"),
    supabase.from("location_opening_hours").select("weekday, opens_at, closes_at").eq("location_id", ctx.location.id),
    supabase.from("locations").select("currency").eq("id", ctx.location.id).single(),
  ]);

  return (
    <>
      <AppHeader subtitle={ctx.location.name} nav={businessNav(ctx.location.slug, "team", ctx.role)} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-3">
          <Link href="/dashboard/team" className="text-sm text-muted hover:text-ink">
            ← Team
          </Link>
          <Eyebrow>Team</Eyebrow>
          <h1 className="font-display text-4xl leading-tight">Add a team member</h1>
          <p className="text-ink-soft">
            Their calendar is ready as soon as you save. You can give them their own login afterwards.
          </p>
        </div>
        <StaffForm
          currency={location?.currency ?? "NZD"}
          services={services ?? []}
          staff={{
            id: null,
            displayName: "",
            bio: "",
            calendarColor: null,
            bookableOnline: true,
            // New team members start with every service and the opening hours.
            serviceIds: (services ?? []).map((s) => s.id),
            hours: windowsFromRows((opening ?? []).map((h) => ({ weekday: h.weekday, start: h.opens_at, end: h.closes_at }))),
          }}
        />
      </main>
    </>
  );
}
