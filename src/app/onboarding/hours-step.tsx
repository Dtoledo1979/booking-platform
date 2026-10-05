"use client";

import { useActionState } from "react";
import { WeekHoursFields, windowsFromRows, type DayWindow } from "@/components/app/week-hours-fields";
import { Card } from "@/components/ui/card";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import { idle } from "@/lib/form-state";
import { saveHours } from "./actions";

export type HoursRow = { weekday: number; opens_at: string; closes_at: string };

// Typical salon week, used until the owner saves their own.
const DEFAULTS: Record<number, DayWindow> = {
  0: null,
  1: null,
  2: ["09:00", "17:30"],
  3: ["09:00", "17:30"],
  4: ["09:00", "20:00"],
  5: ["09:00", "17:30"],
  6: ["09:00", "16:00"],
};

export function HoursStep({ hours, ownerWorks, editing = false }: { hours: HoursRow[]; ownerWorks: boolean; editing?: boolean }) {
  const [state, action] = useActionState(saveHours, idle);
  const initial = hours.length
    ? windowsFromRows(hours.map((h) => ({ weekday: h.weekday, start: h.opens_at, end: h.closes_at })))
    : DEFAULTS;

  return (
    <Card>
      <form action={action} className="flex flex-col gap-5" noValidate>
        <FormMessage status={state.status} message={state.message} />
        <WeekHoursFields
          initial={initial}
          echoed={state.status === "error" ? state.values : undefined}
          fieldErrors={state.fieldErrors}
        />
        <p className="text-sm text-muted">
          {ownerWorks
            ? "These are also your bookable hours. You can add breaks and days off from the calendar."
            : "Each team member's own hours are set on the Team page."}
        </p>
        <SubmitButton size="lg" pendingLabel="Saving…">
          {editing ? "Save hours" : "Save and finish"}
        </SubmitButton>
      </form>
    </Card>
  );
}
