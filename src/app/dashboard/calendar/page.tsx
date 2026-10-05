import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader, businessNav } from "@/components/app/app-header";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { loadCalendar } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import { localDateKey, type PolicyTerms } from "@/lib/format";
import { getOwnerContext, getSetupStep } from "@/lib/owner-context";
import { createClient } from "@/lib/supabase/server";
import { addDaysKey, DATE_KEY, localMinutes, startOfWeekKey, weekdayOf } from "@/lib/time";
import { AppointmentPanel, type PanelFee } from "./appointment-panel";
import { BlockPanel } from "./block-panel";
import { CalendarGrid, type Column } from "./calendar-grid";
import { NewAppointmentPanel } from "./new-appointment-panel";

export const metadata: Metadata = { title: "Calendar" };

const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export default async function CalendarPage({ searchParams }: PageProps<"/dashboard/calendar">) {
  const user = await requireUser("/dashboard/calendar");
  const supabase = await createClient();
  const ctx = await getOwnerContext(supabase, user.id);
  if (!ctx || (await getSetupStep(supabase, ctx)) !== "done") redirect("/onboarding");

  const q = await searchParams;
  const str = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : null);
  const tz = ctx.location.timezone;
  const nowIso = new Date().toISOString();
  const today = localDateKey(nowIso, tz);
  const date = str("date") && DATE_KEY.test(str("date")!) ? str("date")! : today;
  const view = str("view") === "week" ? "week" : "day";

  const [{ data: staffRows }, { data: workRows }, { data: locationRow }, { data: services }, { data: policy }] =
    await Promise.all([
      supabase
        .from("staff")
        .select("id, display_name")
        .eq("location_id", ctx.location.id)
        .eq("active", true)
        .order("sort_order"),
      supabase.from("staff_working_hours").select("staff_id, weekday, starts_at, ends_at").eq("location_id", ctx.location.id),
      supabase.from("locations").select("currency, no_show_grace_minutes").eq("id", ctx.location.id).single(),
      supabase
        .from("services")
        .select("id, name, duration_minutes, price_cents")
        .eq("location_id", ctx.location.id)
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("cancellation_policies")
        .select("free_cancellation_hours, late_cancel_fee_type, late_cancel_fee_value, no_show_fee_type, no_show_fee_value")
        .eq("location_id", ctx.location.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  const staff = staffRows ?? [];
  const currency = locationRow?.currency ?? "NZD";

  const weekStaff = staff.find((m) => m.id === str("staff")) ?? staff[0];
  const firstDay = view === "week" ? startOfWeekKey(date) : date;
  const days = view === "week" ? 7 : 1;
  const { appointments, timeOff } = await loadCalendar(supabase, ctx.location.id, firstDay, days, tz);

  const hoursFor = (staffId: string, dateKey: string) =>
    (workRows ?? [])
      .filter((w) => w.staff_id === staffId && w.weekday === weekdayOf(dateKey))
      .map((w) => ({ start: minutes(w.starts_at), end: minutes(w.ends_at) }));

  const dayLabel = (d: string) =>
    new Intl.DateTimeFormat("en-NZ", { timeZone: "UTC", weekday: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));

  const columns: Column[] =
    view === "week" && weekStaff
      ? Array.from({ length: 7 }, (_, i) => addDaysKey(firstDay, i)).map((d) => ({
          key: d,
          label: dayLabel(d),
          sublabel: d === today ? "Today" : undefined,
          dateKey: d,
          staffId: weekStaff.id,
          hours: hoursFor(weekStaff.id, d),
        }))
      : staff.map((m) => ({ key: m.id, label: m.display_name, dateKey: date, staffId: m.id, hours: hoursFor(m.id, date) }));

  // Visible range: working hours and appointments, padded to whole hours,
  // never narrower than 9–17.
  const spans = [
    ...columns.flatMap((c) => c.hours),
    ...appointments.map((a) => ({ start: localMinutes(a.startsAt, tz), end: localMinutes(a.endsAt, tz) || 1440 })),
  ];
  const dayStart = Math.max(0, Math.floor(Math.min(9 * 60, ...spans.map((s) => s.start)) / 60) * 60 - 60);
  const dayEnd = Math.min(1440, Math.ceil(Math.max(17 * 60, ...spans.map((s) => s.end)) / 60) * 60 + 60);

  // Links keep the current view and only change what's asked.
  const base: Record<string, string | null> = {
    date,
    view: view === "week" ? "week" : null,
    staff: view === "week" ? (weekStaff?.id ?? null) : null,
  };
  const hrefFor = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...base, ...patch })) if (v) params.set(k, v);
    return `/dashboard/calendar?${params}`;
  };
  const closeHref = hrefFor({});
  const step = view === "week" ? 7 : 1;

  const selectedId = str("appt");
  const selected = selectedId ? appointments.find((a) => a.id === selectedId) : undefined;
  const panel = str("panel");

  let side: React.ReactNode = null;
  if (selected) {
    const [{ data: fees }, { data: note }] = await Promise.all([
      supabase
        .from("booking_fees")
        .select("id, kind, amount_cents, status, refund_requested_at")
        .eq("appointment_id", selected.id),
      supabase.from("appointment_notes").select("body").eq("appointment_id", selected.id).maybeSingle(),
    ]);
    side = (
      <AppointmentPanel
        key={`${selected.id}-${selected.status}-${selected.startsAt}-${selected.staffId}`}
        appointment={selected}
        staffName={staff.find((m) => m.id === selected.staffId)?.display_name ?? "—"}
        staff={staff}
        timeZone={tz}
        currency={currency}
        policy={(policy as PolicyTerms | null) ?? null}
        graceMinutes={locationRow?.no_show_grace_minutes ?? 15}
        fees={(fees ?? []) as PanelFee[]}
        note={note?.body ?? ""}
        closeHref={closeHref}
        nowIso={nowIso}
      />
    );
  } else if (panel === "new") {
    const { data: clientRows } = await supabase
      .from("location_clients")
      .select("id, first_name, last_name, phone, email")
      .eq("location_id", ctx.location.id)
      .eq("is_blocked", false)
      .order("first_name")
      .limit(1000);
    side = (
      <NewAppointmentPanel
        clients={(clientRows ?? []).map((c) => ({
          id: c.id,
          name: [c.first_name, c.last_name].filter(Boolean).join(" "),
          phone: c.phone,
          email: c.email,
        }))}
        services={services ?? []}
        staff={staff}
        currency={currency}
        defaults={{
          staffId: staff.some((m) => m.id === str("staff")) ? str("staff")! : (staff[0]?.id ?? ""),
          date: str("date") ?? date,
          time: str("time") ?? "10:00",
        }}
        closeHref={closeHref}
      />
    );
  } else if (panel === "block") {
    side = (
      <BlockPanel
        block={timeOff.find((b) => b.id === str("block")) ?? null}
        staff={staff}
        timeZone={tz}
        defaults={{ staffId: staff.some((m) => m.id === str("staff")) ? str("staff")! : (staff[0]?.id ?? ""), date }}
        closeHref={closeHref}
      />
    );
  }

  const title =
    view === "week"
      ? `${dayLabel(firstDay)} – ${new Intl.DateTimeFormat("en-NZ", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(`${addDaysKey(firstDay, 6)}T12:00:00Z`))}`
      : new Intl.DateTimeFormat("en-NZ", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
          new Date(`${date}T12:00:00Z`),
        );
  const dayCount = appointments.filter((a) => a.status !== "cancelled").length;

  return (
    <>
      <AppHeader subtitle={ctx.location.name} nav={businessNav(ctx.location.slug, "calendar")} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={hrefFor({ date: today })} className={buttonClasses("secondary", "sm")}>
              Today
            </Link>
            <Link href={hrefFor({ date: addDaysKey(date, -step) })} className={buttonClasses("ghost", "sm")} aria-label="Previous">
              ←
            </Link>
            <Link href={hrefFor({ date: addDaysKey(date, step) })} className={buttonClasses("ghost", "sm")} aria-label="Next">
              →
            </Link>
            <h1 className="ml-1 font-display text-2xl sm:text-3xl">{title}</h1>
            <span className="text-sm text-muted">
              {dayCount} appointment{dayCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-control border border-line-strong p-0.5" role="group" aria-label="View">
              {(["day", "week"] as const).map((v) => (
                <Link
                  key={v}
                  href={hrefFor({ view: v === "week" ? "week" : null, staff: v === "week" ? (weekStaff?.id ?? null) : null })}
                  aria-current={view === v ? "page" : undefined}
                  className={cn(
                    "rounded-[0.5rem] px-3 py-1.5 text-sm capitalize",
                    view === v ? "bg-ink text-on-ink" : "text-ink-soft hover:bg-stone",
                  )}
                >
                  {v}
                </Link>
              ))}
            </div>
            {view === "week" && staff.length > 1 && (
              <div className="flex flex-wrap gap-1" role="group" aria-label="Professional">
                {staff.map((m) => (
                  <Link
                    key={m.id}
                    href={hrefFor({ staff: m.id })}
                    aria-current={weekStaff?.id === m.id ? "page" : undefined}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm",
                      weekStaff?.id === m.id ? "border-ink bg-ink text-on-ink" : "border-line-strong hover:bg-stone",
                    )}
                  >
                    {m.display_name}
                  </Link>
                ))}
              </div>
            )}
            <Link href={hrefFor({ panel: "block", appt: null })} scroll={false} className={buttonClasses("secondary", "sm")}>
              Block time
            </Link>
            <Link href={hrefFor({ panel: "new", appt: null })} scroll={false} className={buttonClasses("primary", "sm")}>
              New appointment
            </Link>
          </div>
        </div>

        {staff.length === 0 ? (
          <Card className="flex flex-col gap-2">
            <h2 className="font-display text-2xl">No bookable team members yet</h2>
            <p className="text-ink-soft">Add the people who take appointments to see their calendars here.</p>
          </Card>
        ) : (
          <div className={cn("grid gap-5", side && "xl:grid-cols-[minmax(0,1fr)_24rem]")}>
            <div className={cn("min-w-0", side && "order-2 xl:order-1")}>
              <CalendarGrid
                columns={columns}
                appointments={appointments}
                timeOff={timeOff}
                timeZone={tz}
                dayStart={dayStart}
                dayEnd={dayEnd}
                hrefFor={hrefFor}
                selectedId={selected?.id ?? null}
                nowIso={nowIso}
              />
            </div>
            {side && <aside className="order-1 min-w-0 xl:order-2">{side}</aside>}
          </div>
        )}
      </main>
    </>
  );
}
