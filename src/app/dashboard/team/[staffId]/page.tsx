import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppHeader, businessNav } from "@/components/app/app-header";
import { windowsFromRows } from "@/components/app/week-hours-fields";
import { Badge, Card, Eyebrow } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { can, getMemberContext } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "../invite-form";
import { StaffActiveButton } from "../member-actions";
import { StaffForm } from "../staff-form";

export const metadata: Metadata = { title: "Team member" };

export default async function EditStaffPage({ params }: PageProps<"/dashboard/team/[staffId]">) {
  const { staffId } = await params;
  const user = await requireUser(`/dashboard/team/${staffId}`);
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");
  const perms = can(ctx.role);
  if (!perms.manageBusiness) redirect("/dashboard/calendar");

  const { data: member } = await supabase
    .from("staff")
    .select("id, display_name, bio, calendar_color, active, is_bookable_online, user_id")
    .eq("id", staffId)
    .eq("location_id", ctx.location.id)
    .maybeSingle();
  if (!member) notFound();

  const [{ data: services }, { data: links }, { data: hours }, { data: location }, { data: members }] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, duration_minutes, price_cents")
      .eq("location_id", ctx.location.id)
      .eq("active", true)
      .order("sort_order"),
    supabase.from("staff_services").select("service_id").eq("staff_id", member.id),
    supabase.from("staff_working_hours").select("weekday, starts_at, ends_at").eq("staff_id", member.id),
    supabase.from("locations").select("currency").eq("id", ctx.location.id).single(),
    supabase.rpc("location_members", { p_location_id: ctx.location.id }),
  ]);
  const pendingInvite = members?.find((m) => m.staff_id === member.id && m.status === "invited");
  const isMe = member.user_id === user.id;

  return (
    <>
      <AppHeader subtitle={ctx.location.name} nav={businessNav(ctx.location.slug, "team", ctx.role)} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-3">
          <Link href="/dashboard/team" className="text-sm text-muted hover:text-ink">
            ← Team
          </Link>
          <Eyebrow>Team member</Eyebrow>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl leading-tight">{member.display_name}</h1>
            {!member.active && <Badge>Inactive</Badge>}
          </div>
        </div>

        <StaffForm
          currency={location?.currency ?? "NZD"}
          services={services ?? []}
          staff={{
            id: member.id,
            displayName: member.display_name,
            bio: member.bio ?? "",
            calendarColor: member.calendar_color,
            bookableOnline: member.is_bookable_online,
            serviceIds: (links ?? []).map((l) => l.service_id),
            hours: windowsFromRows((hours ?? []).map((h) => ({ weekday: h.weekday, start: h.starts_at, end: h.ends_at }))),
          }}
        />

        <section className="flex flex-col gap-3" aria-labelledby="login-heading">
          <h2 id="login-heading" className="font-display text-2xl">
            Login
          </h2>
          {member.user_id ? (
            <Card>
              <p className="text-ink-soft">
                {isMe ? "This is you." : `${member.display_name} signs in to see their own calendar.`} Manage access on the{" "}
                <Link href="/dashboard/team" className="underline underline-offset-2">
                  Team page
                </Link>
                .
              </p>
            </Card>
          ) : pendingInvite ? (
            <Card>
              <p className="text-ink-soft">
                Invite sent to <strong>{pendingInvite.email}</strong>. Create a new link from the Team page if they lost it.
              </p>
            </Card>
          ) : member.active ? (
            <InviteForm canInviteManagers={false} unlinkedStaff={[{ id: member.id, display_name: member.display_name }]} presetStaffId={member.id} />
          ) : null}
        </section>

        {!isMe && (
          <section className="flex flex-col gap-3 border-t border-line pt-8" aria-labelledby="status-heading">
            <h2 id="status-heading" className="font-display text-2xl">
              {member.active ? "Deactivate" : "Reactivate"}
            </h2>
            <p className="text-sm text-muted">
              {member.active
                ? "Inactive team members disappear from the booking page and calendar. Their past appointments are kept."
                : "Bring them back to the calendar and booking page."}
            </p>
            <StaffActiveButton staffId={member.id} active={member.active} />
          </section>
        )}
      </main>
    </>
  );
}
