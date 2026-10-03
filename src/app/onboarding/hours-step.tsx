"use client";

import { useActionState } from "react";
import { Card } from "@/components/ui/card";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { idle } from "@/lib/form-state";
import { saveHours } from "./actions";

export type HoursRow = { weekday: number; opens_at: string; closes_at: string };

// Monday first, as NZ calendars show it. 0 = Sunday in the database.
const WEEK = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [0, "Sunday"],
] as const;

const DEFAULTS: Record<number, [string, string] | null> = {
  0: null,
  1: null,
  2: ["09:00", "17:30"],
  3: ["09:00", "17:30"],
  4: ["09:00", "20:00"],
  5: ["09:00", "17:30"],
  6: ["09:00", "16:00"],
};

export function HoursStep({ hours, ownerWorks }: { hours: HoursRow[]; ownerWorks: boolean }) {
  const [state, action] = useActionState(saveHours, idle);
  const saved = new Map(hours.map((h) => [h.weekday, [h.opens_at.slice(0, 5), h.closes_at.slice(0, 5)]]));
  const echoed = state.status === "error" ? state.values : undefined;

  return (
    <Card>
      <form action={action} className="flex flex-col gap-5" noValidate>
        <FormMessage status={state.status} message={state.message} />
        <ul className="flex flex-col divide-y divide-line">
          {WEEK.map(([weekday, label]) => {
            const initial = saved.size ? (saved.get(weekday) ?? null) : DEFAULTS[weekday];
            const open = echoed ? echoed[`open_${weekday}`] === "on" : initial !== null;
            const opens = echoed?.[`opens_${weekday}`] ?? initial?.[0] ?? "09:00";
            const closes = echoed?.[`closes_${weekday}`] ?? initial?.[1] ?? "17:00";
            const error = state.fieldErrors?.[`day_${weekday}`]?.[0];
            return (
              <li key={weekday} className="py-3">
                <div className="group flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex w-36 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      name={`open_${weekday}`}
                      defaultChecked={open}
                      className="day-toggle size-4 accent-[var(--ink)]"
                    />
                    <span className="font-medium">{label}</span>
                  </label>
                  <span className="flex items-center gap-2 group-has-[.day-toggle:not(:checked)]:opacity-40">
                    <input
                      type="time"
                      name={`opens_${weekday}`}
                      defaultValue={opens}
                      step={900}
                      aria-label={`${label} opens`}
                      className={cn(
                        "tabular h-10 rounded-control border border-line-strong bg-surface px-2.5 font-mono text-sm",
                        error && "border-danger",
                      )}
                    />
                    <span className="text-muted">–</span>
                    <input
                      type="time"
                      name={`closes_${weekday}`}
                      defaultValue={closes}
                      step={900}
                      aria-label={`${label} closes`}
                      className={cn(
                        "tabular h-10 rounded-control border border-line-strong bg-surface px-2.5 font-mono text-sm",
                        error && "border-danger",
                      )}
                    />
                  </span>
                </div>
                {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-muted">
          {ownerWorks
            ? "These are also your bookable hours. You can add breaks and days off from the dashboard."
            : "Your team's individual hours are set when you add them."}
        </p>
        <SubmitButton size="lg" pendingLabel="Saving…">
          Save and finish
        </SubmitButton>
      </form>
    </Card>
  );
}
