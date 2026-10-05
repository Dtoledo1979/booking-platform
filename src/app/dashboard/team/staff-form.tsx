"use client";

import { useActionState } from "react";
import { WeekHoursFields, type DayWindow } from "@/components/app/week-hours-fields";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { idle } from "@/lib/form-state";
import { formatDuration, formatMoney } from "@/lib/format";
import { STAFF_COLORS } from "@/lib/staff-colors";
import { saveStaff } from "./actions";

export type StaffFormValues = {
  id: string | null;
  displayName: string;
  bio: string;
  calendarColor: string | null;
  bookableOnline: boolean;
  serviceIds: string[];
  hours: Record<number, DayWindow>;
};

export function StaffForm({
  staff,
  services,
  currency,
}: {
  staff: StaffFormValues;
  services: { id: string; name: string; duration_minutes: number; price_cents: number }[];
  currency: string;
}) {
  const [state, action] = useActionState(saveStaff, idle);
  const err = (name: string) => state.fieldErrors?.[name]?.[0];
  const echoed = state.status === "error" ? state.values : undefined;
  const color = echoed?.calendarColor ?? staff.calendarColor ?? STAFF_COLORS[0];

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <FormMessage status={state.status} message={state.message} />
      <input type="hidden" name="staffId" value={staff.id ?? ""} />

      <Card className="flex flex-col gap-4">
        <h2 className="font-display text-2xl">Profile</h2>
        <Field label="Name clients see" htmlFor="displayName" error={err("displayName")}>
          <Input
            id="displayName"
            name="displayName"
            defaultValue={echoed?.displayName ?? staff.displayName}
            placeholder="e.g. Mia"
            required
            aria-invalid={!!err("displayName")}
          />
        </Field>
        <Field label="Short bio" htmlFor="bio" hint="Optional, e.g. “Colour specialist” or “Fades & beard work”.">
          <Textarea id="bio" name="bio" rows={2} defaultValue={echoed?.bio ?? staff.bio} />
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Calendar colour</legend>
          <div className="flex flex-wrap gap-2">
            {STAFF_COLORS.map((c, i) => (
              <label key={c} className="cursor-pointer">
                <input
                  type="radio"
                  name="calendarColor"
                  value={c}
                  defaultChecked={c === color}
                  aria-label={`Colour ${i + 1}`}
                  className="peer sr-only"
                />
                <span
                  className="block size-8 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-brass peer-focus-visible:ring-2 peer-focus-visible:ring-brass"
                  style={{ background: c }}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            name="bookableOnline"
            defaultChecked={echoed ? echoed.bookableOnline === "on" : staff.bookableOnline}
            className="mt-1 size-4 accent-[var(--ink)]"
          />
          <span>
            <span className="block font-medium">Clients can book them online</span>
            <span className="block text-sm text-muted">Turn off for staff who only take phone or walk-in bookings.</span>
          </span>
        </label>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-2xl">Services they do</h2>
        {services.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {services.map((s) => (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center justify-between gap-3 py-2.5">
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      name="services"
                      value={s.id}
                      defaultChecked={echoed ? (echoed.services ?? "").split(",").includes(s.id) : staff.serviceIds.includes(s.id)}
                      className="size-4 accent-[var(--ink)]"
                    />
                    <span>
                      <span className="block font-medium">{s.name}</span>
                      <span className="block text-xs text-muted">{formatDuration(s.duration_minutes)}</span>
                    </span>
                  </span>
                  <span className="tabular font-mono text-sm">{formatMoney(s.price_cents, currency)}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Add services first, then assign them here.</p>
        )}
      </Card>

      <Card className={cn("flex flex-col gap-3")}>
        <div>
          <h2 className="font-display text-2xl">Working hours</h2>
          <p className="text-sm text-muted">Clients can only book them inside these hours.</p>
        </div>
        <WeekHoursFields initial={staff.hours} echoed={echoed} fieldErrors={state.fieldErrors} />
      </Card>

      <div>
        <SubmitButton size="lg" pendingLabel="Saving…">
          {staff.id ? "Save changes" : "Add team member"}
        </SubmitButton>
      </div>
    </form>
  );
}
