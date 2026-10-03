"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { idle } from "@/lib/form-state";
import {
  addDays,
  formatDate,
  formatDuration,
  formatMoney,
  formatTime,
  localDateKey,
  policySentences,
  type PolicyTerms,
} from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { confirmBooking } from "./actions";

const WINDOW_DAYS = 14;

type Slot = { slot_start: string; staff_id: string };

export type BookingFlowProps = {
  slug: string;
  location: { id: string; name: string; timezone: string; currency: string; maxAdvanceDays: number };
  service: { id: string; name: string; duration_minutes: number; price_cents: number; price_type: "fixed" | "from" };
  staff: { id: string; display_name: string }[];
  policy: PolicyTerms | null;
  isPreview: boolean;
  signedIn: boolean;
  today: string; // YYYY-MM-DD in the location's time zone
  initial: { staffId: string | null; start: string | null };
  rescheduleId: string | null;
};

export function BookingFlow(props: BookingFlowProps) {
  const { slug, location, service, staff, policy, isPreview, signedIn, today, initial, rescheduleId } = props;
  const tz = location.timezone;
  const lastDay = addDays(today, location.maxAdvanceDays);

  const [staffId, setStaffId] = useState<string | null>(initial.staffId);
  const [windowStart, setWindowStart] = useState(() =>
    initial.start ? localDateKey(initial.start, tz) : today,
  );
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ key: string; slots: Slot[]; failed: boolean } | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(initial.start ? localDateKey(initial.start, tz) : null);
  const [pickedStart, setPickedStart] = useState<string | null>(initial.start);
  const [state, action] = useActionState(confirmBooking, idle);

  const key = `${staffId ?? "any"}|${windowStart}|${refresh}`;
  const loading = result?.key !== key;

  // Fetch open slots for a two-week window. The server decides what's
  // free; the client only groups and displays.
  useEffect(() => {
    if (isPreview) return;
    let cancelled = false;
    createClient()
      .rpc("get_available_slots", {
        p_location_id: location.id,
        p_service_id: service.id,
        p_date_from: windowStart,
        p_date_to: addDays(windowStart, WINDOW_DAYS - 1),
        p_staff_id: staffId ?? undefined,
      })
      .then(({ data, error }) => {
        if (!cancelled) setResult({ key, slots: data ?? [], failed: Boolean(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [key, isPreview, location.id, service.id, staffId, windowStart]);

  // A failed booking (usually "slot taken") refreshes availability.
  const [handledError, setHandledError] = useState<typeof state | null>(null);
  if (state.status === "error" && state !== handledError) {
    setHandledError(state);
    setPickedStart(null);
    setRefresh((n) => n + 1);
  }

  const slots = useMemo(() => (loading ? [] : (result?.slots ?? [])), [loading, result]);

  // start time -> staff ids free then (several when "no preference")
  const byDay = useMemo(() => {
    const map = new Map<string, Map<string, string[]>>();
    for (const s of slots) {
      const day = localDateKey(s.slot_start, tz);
      const starts = map.get(day) ?? map.set(day, new Map()).get(day)!;
      (starts.get(s.slot_start) ?? starts.set(s.slot_start, []).get(s.slot_start)!).push(s.staff_id);
    }
    return map;
  }, [slots, tz]);

  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(windowStart, i)).filter((d) => d <= lastDay);
  const selectedDay = pickedDay && byDay.has(pickedDay) ? pickedDay : (days.find((d) => byDay.has(d)) ?? null);
  const daySlots = selectedDay ? [...(byDay.get(selectedDay)?.keys() ?? [])].sort() : [];
  const selectedStart = pickedStart && daySlots.includes(pickedStart) ? pickedStart : null;
  const chosenStaff = staff.find((m) => m.id === staffId);

  const resumeUrl = `/${slug}/book?service=${service.id}${staffId ? `&staff=${staffId}` : ""}${
    selectedStart ? `&start=${encodeURIComponent(selectedStart)}` : ""
  }`;

  if (isPreview) {
    return (
      <Card className="flex flex-col gap-2">
        <h2 className="font-display text-2xl">Online booking opens when you go live</h2>
        <p className="text-ink-soft">
          This is a preview of your booking page. Available times appear here once your location is active.
        </p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-6">
        {staff.length > 1 && (
          <section className="flex flex-col gap-3" aria-labelledby="staff-heading">
            <h2 id="staff-heading" className="text-sm font-medium uppercase tracking-[0.14em] text-muted">
              With
            </h2>
            <div className="flex flex-wrap gap-2">
              {[{ id: null, display_name: "No preference" }, ...staff].map((m) => (
                <button
                  key={m.id ?? "any"}
                  type="button"
                  aria-pressed={staffId === m.id}
                  onClick={() => {
                    setStaffId(m.id);
                    setPickedStart(null);
                  }}
                  className={cn(
                    "h-10 rounded-full border px-4 text-sm transition-colors",
                    staffId === m.id ? "border-ink bg-ink text-on-ink" : "border-line-strong hover:bg-stone",
                  )}
                >
                  {m.display_name}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3" aria-labelledby="date-heading">
          <div className="flex items-center justify-between">
            <h2 id="date-heading" className="text-sm font-medium uppercase tracking-[0.14em] text-muted">
              Date
            </h2>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={windowStart <= today}
                onClick={() => setWindowStart((w) => (addDays(w, -WINDOW_DAYS) < today ? today : addDays(w, -WINDOW_DAYS)))}
                aria-label="Earlier dates"
              >
                ←
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={addDays(windowStart, WINDOW_DAYS) > lastDay}
                onClick={() => setWindowStart((w) => addDays(w, WINDOW_DAYS))}
                aria-label="Later dates"
              >
                →
              </Button>
            </div>
          </div>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {days.map((d) => {
              const open = byDay.has(d);
              const noon = `${d}T12:00:00Z`;
              return (
                <button
                  key={d}
                  type="button"
                  disabled={!open}
                  aria-pressed={selectedDay === d}
                  onClick={() => {
                    setPickedDay(d);
                    setPickedStart(null);
                  }}
                  className={cn(
                    "flex w-16 shrink-0 flex-col items-center rounded-control border py-2.5 transition-colors",
                    selectedDay === d
                      ? "border-ink bg-ink text-on-ink"
                      : open
                        ? "border-line-strong hover:bg-stone"
                        : "border-transparent text-muted opacity-50",
                  )}
                >
                  <span className="text-xs uppercase">{formatDate(noon, "UTC", "short").split(" ")[0].replace(",", "")}</span>
                  <span className="tabular font-mono text-lg">{Number(d.slice(8))}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="time-heading" aria-busy={loading}>
          <h2 id="time-heading" className="text-sm font-medium uppercase tracking-[0.14em] text-muted">
            {selectedDay ? formatDate(`${selectedDay}T12:00:00Z`, "UTC") : "Time"}
          </h2>
          {loading ? (
            <p className="text-muted">Finding available times…</p>
          ) : result?.failed ? (
            <p className="text-danger">We couldn&apos;t load available times. Please refresh the page.</p>
          ) : !selectedDay ? (
            <p className="text-muted">No times available in these two weeks. Try later dates.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {daySlots.map((start) => (
                <button
                  key={start}
                  type="button"
                  aria-pressed={selectedStart === start}
                  onClick={() => setPickedStart(start)}
                  className={cn(
                    "tabular h-11 rounded-control border font-mono text-sm transition-colors",
                    selectedStart === start ? "border-ink bg-ink text-on-ink" : "border-line-strong hover:bg-stone",
                  )}
                >
                  {formatTime(start, tz)}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <Card className="flex flex-col gap-5 lg:sticky lg:top-6">
        <div>
          <p className="font-display text-2xl leading-tight">{service.name}</p>
          <p className="text-sm text-muted">
            {formatDuration(service.duration_minutes)} · {service.price_type === "from" ? "from " : ""}
            {formatMoney(service.price_cents, location.currency)}
          </p>
        </div>

        {selectedStart ? (
          <div className="rounded-control bg-stone px-4 py-3">
            <p className="font-medium">{formatDate(selectedStart, tz)}</p>
            <p className="tabular font-mono text-sm">{formatTime(selectedStart, tz)}</p>
            {chosenStaff && <p className="text-sm text-muted">with {chosenStaff.display_name}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted">Choose a date and time.</p>
        )}

        {policy && (
          <div className="flex flex-col gap-1 border-t border-line pt-4">
            <p className="text-sm font-medium">Cancellation policy</p>
            {policySentences(policy, service.price_cents, location.currency).map((s) => (
              <p key={s} className="text-sm text-ink-soft">
                {s}
              </p>
            ))}
          </div>
        )}

        {!signedIn ? (
          <div className="flex flex-col gap-2">
            <Link
              href={`/login?next=${encodeURIComponent(resumeUrl)}`}
              className={buttonClasses("primary", "lg", selectedStart ? undefined : "pointer-events-none opacity-40")}
              aria-disabled={!selectedStart}
            >
              Sign in to book
            </Link>
            <Link
              href={`/signup?next=${encodeURIComponent(resumeUrl)}`}
              className={buttonClasses("secondary", "md", selectedStart ? undefined : "pointer-events-none opacity-40")}
              aria-disabled={!selectedStart}
            >
              New here? Create an account
            </Link>
          </div>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            <FormMessage status={state.status} message={state.message} />
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="locationId" value={location.id} />
            <input type="hidden" name="serviceId" value={service.id} />
            <input type="hidden" name="staffId" value={staffId ?? ""} />
            <input type="hidden" name="startsAt" value={selectedStart ?? ""} />
            <input type="hidden" name="rescheduleId" value={rescheduleId ?? ""} />
            <label className="flex items-start gap-3 text-sm text-ink-soft">
              <input type="checkbox" name="accept" required className="mt-0.5 size-4 accent-[var(--ink)]" />
              <span>I&apos;ve read and accept the cancellation policy.</span>
            </label>
            <SubmitButton size="lg" disabled={!selectedStart} pendingLabel="Booking…">
              {rescheduleId ? "Confirm new time" : "Confirm booking"}
            </SubmitButton>
          </form>
        )}
      </Card>
    </div>
  );
}
