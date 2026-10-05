"use client";

import { cn } from "@/lib/cn";

// Monday first, as NZ calendars show it. 0 = Sunday in the database.
export const WEEK = [
  [1, "Monday"],
  [2, "Tuesday"],
  [3, "Wednesday"],
  [4, "Thursday"],
  [5, "Friday"],
  [6, "Saturday"],
  [0, "Sunday"],
] as const;

export type DayWindow = [start: string, end: string] | null;

// One open/closed toggle and a start–end window per weekday. Field names
// match parseWeekHours() in lib/hours.ts. (Split shifts, e.g. a lunch
// break, are handled with blocked time in the calendar.)
export function WeekHoursFields({
  initial,
  echoed,
  fieldErrors,
}: {
  initial: Record<number, DayWindow>;
  echoed?: Record<string, string>;
  fieldErrors?: Record<string, string[] | undefined>;
}) {
  return (
    <ul className="flex flex-col divide-y divide-line">
      {WEEK.map(([weekday, label]) => {
        const day = initial[weekday] ?? null;
        const open = echoed ? echoed[`open_${weekday}`] === "on" : day !== null;
        const start = echoed?.[`opens_${weekday}`] ?? day?.[0] ?? "09:00";
        const end = echoed?.[`closes_${weekday}`] ?? day?.[1] ?? "17:00";
        const error = fieldErrors?.[`day_${weekday}`]?.[0];
        const timeClass = cn(
          "tabular h-10 rounded-control border border-line-strong bg-surface px-2.5 font-mono text-sm",
          error && "border-danger",
        );
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
                  defaultValue={start}
                  step={900}
                  aria-label={`${label} start`}
                  className={timeClass}
                />
                <span className="text-muted">–</span>
                <input
                  type="time"
                  name={`closes_${weekday}`}
                  defaultValue={end}
                  step={900}
                  aria-label={`${label} end`}
                  className={timeClass}
                />
              </span>
            </div>
            {error && <p className="mt-1.5 text-sm text-danger">{error}</p>}
          </li>
        );
      })}
    </ul>
  );
}

export function windowsFromRows(rows: { weekday: number; start: string; end: string }[]): Record<number, DayWindow> {
  const out: Record<number, DayWindow> = {};
  for (const r of rows) {
    const prev = out[r.weekday];
    // Several windows on one day collapse to their overall span here.
    out[r.weekday] = prev
      ? [prev[0] < r.start.slice(0, 5) ? prev[0] : r.start.slice(0, 5), prev[1] > r.end.slice(0, 5) ? prev[1] : r.end.slice(0, 5)]
      : [r.start.slice(0, 5), r.end.slice(0, 5)];
  }
  return out;
}
