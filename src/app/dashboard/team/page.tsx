import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader, businessNav } from "@/components/app/app-header";
import { buttonClasses } from "@/components/ui/button";
import { Badge, Card, Eyebrow } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { can, countBookableStaff, getMemberContext } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";
import { RemoveMemberButton } from "./member-actions";

export const metadata: Metadata = { title: "Team" };

const ROLE_LABEL = { owner: "Owner", manager: "Manager", reception: "Reception", professional: "Professional" } as const;

export default async function TeamPage({ searchParams }: PageProps<"/dashboard/team">) {
  const user = await requireUser("/dashboard/team");
  const supabase = await createClient();
  const ctx = await getMemberContext(supabase, user.id);
  if (!ctx) redirect("/onboarding");
  const perms = can(ctx.role);
  if (!perms.manageBusiness) redirect("/dashboard/calendar");

  const [{ data: staff }, { data: links }, { data: hours }, { data: members }, seats] = await Promise.all([
    supabase
      .from("staff")
      .select("id, display_name, bio, calendar_color, active, is_bookable_online, user_id")
      .eq("location_id", ctx.location.id)
      .order("active", { ascending: false })
      .order("sort_order"),
    supabase.from("staff_services").select("staff_id").eq("location_id", ctx.location.id),
    supabase.from("staff_working_hours").select("staff_id, weekday").eq("location_id", ctx.location.id),
    supabase.rpc("location_members", { p_location_id: ctx.location.id }),
    countBookableStaff(supabase, ctx.location.id),
  ]);

  const savedId = (await searchParams).saved;
  const unlinked = (staff ?? []).filter((m) => m.active && !m.user_id && !members?.some((x) => x.staff_id === m.id && x.status === "invited"));

  return (
    <>
      <AppHeader subtitle={ctx.location.name} nav={businessNav(ctx.location.slug, "team", ctx.role)} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-3">
            <Eyebrow>Team</Eyebrow>
            <h1 className="font-display text-4xl leading-tight">Who works here</h1>
            <p className="text-ink-soft">
              {seats} bookable professional{seats === 1 ? "" : "s"} at {ctx.location.name}.
            </p>
          </div>
          <Link href="/dashboard/team/new" className={buttonClasses("primary")}>
            Add team member
          </Link>
        </div>

        {typeof savedId === "string" && (
          <p role="status" className="rounded-control bg-success/10 px-4 py-3 text-sm text-success">
            Saved.
          </p>
        )}

        <section className="flex flex-col gap-3" aria-labelledby="staff-heading">
          <h2 id="staff-heading" className="font-display text-2xl">
            Team members
          </h2>
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {(staff ?? []).map((m) => {
                const serviceCount = links?.filter((l) => l.staff_id === m.id).length ?? 0;
                const days = new Set(hours?.filter((h) => h.staff_id === m.id).map((h) => h.weekday)).size;
                return (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className="flex size-10 shrink-0 items-center justify-center rounded-full font-display text-lg text-white"
                        style={{ background: m.calendar_color ?? "var(--ink)", opacity: m.active ? 1 : 0.4 }}
                      >
                        {m.display_name.charAt(0)}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{m.display_name}</span>
                          {!m.active && <Badge>Inactive</Badge>}
                          {m.active && !m.is_bookable_online && <Badge>Not online</Badge>}
                          {m.user_id && <Badge tone="brass">Has login</Badge>}
                        </span>
                        <span className="block text-sm text-muted">
                          {serviceCount} service{serviceCount === 1 ? "" : "s"} · {days} day{days === 1 ? "" : "s"} a week
                          {m.active && (serviceCount === 0 || days === 0) && (
                            <span className="text-warning"> · not bookable until services and hours are set</span>
                          )}
                        </span>
                      </span>
                    </span>
                    <Link href={`/dashboard/team/${m.id}`} className={buttonClasses("ghost", "sm")}>
                      Edit
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="access-heading">
          <div>
            <h2 id="access-heading" className="font-display text-2xl">
              People with access
            </h2>
            <p className="text-sm text-muted">Logins to this dashboard. Team members without a login still appear in the calendar.</p>
          </div>
          <Card className="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {(members ?? []).map((m) => {
                const removable =
                  m.role !== "owner" && (perms.inviteManagers || m.role === "reception" || m.role === "professional");
                const linkedStaff = staff?.find((s) => s.id === m.staff_id);
                return (
                  <li key={m.membership_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{m.name ?? m.email}</span>
                        <Badge tone={m.role === "owner" ? "brass" : "neutral"}>{ROLE_LABEL[m.role]}</Badge>
                        {m.status === "invited" && <Badge tone="warning">Invite sent</Badge>}
                        {m.status === "expired" && <Badge tone="danger">Invite expired</Badge>}
                      </span>
                      <span className="block truncate text-sm text-muted">
                        {m.name ? m.email : null}
                        {linkedStaff ? ` · calendar: ${linkedStaff.display_name}` : ""}
                      </span>
                    </span>
                    {removable && <RemoveMemberButton membershipId={m.membership_id} label={m.status === "active" ? "access" : "invite"} />}
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="invite-heading">
          <h2 id="invite-heading" className="font-display text-2xl">
            Invite someone
          </h2>
          <InviteForm canInviteManagers={perms.inviteManagers} unlinkedStaff={unlinked.map((m) => ({ id: m.id, display_name: m.display_name }))} />
        </section>
      </main>
    </>
  );
}
