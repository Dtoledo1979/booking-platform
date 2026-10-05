import Link from "next/link";
import type { CalendarAppointment, CalendarBlock } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";
import { localMinutes } from "@/lib/time";

export type Column = {
  key: string;
  label: string;
  sublabel?: string;
  dateKey: string;
  staffId: string;
  // Working windows in local minutes, for shading the off hours.
  hours: { start: number; end: number }[];
};

const PX_PER_MIN = 1.1;
const SLOT_MIN = 30;

const STATUS_STYLE: Record<CalendarAppointment["status"], string> = {
  confirmed: "border-l-ink bg-surface",
  pending: "border-l-warning bg-surface border-dashed",
  completed: "border-l-success bg-stone text-ink-soft",
  no_show: "border-l-danger bg-danger/5 text-ink-soft",
  cancelled: "border-l-line bg-stone text-muted line-through",
};

const hourLabel = (m: number) => {
  const h = Math.floor(m / 60);
  return `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
};

export function CalendarGrid({
  columns,
  appointments,
  timeOff,
  timeZone,
  dayStart,
  dayEnd,
  hrefFor,
  selectedId,
  nowIso,
}: {
  columns: Column[];
  appointments: CalendarAppointment[];
  timeOff: CalendarBlock[];
  timeZone: string;
  dayStart: number;
  dayEnd: number;
  hrefFor: (params: Record<string, string | null>) => string;
  selectedId: string | null;
  nowIso: string;
}) {
  const height = (dayEnd - dayStart) * PX_PER_MIN;
  const hours = Array.from({ length: Math.ceil((dayEnd - dayStart) / 60) }, (_, i) => dayStart + i * 60);
  const y = (minutes: number) => (minutes - dayStart) * PX_PER_MIN;
  const nowKey = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(nowIso));
  const nowMin = localMinutes(nowIso, timeZone);

  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface">
      <div className="flex min-w-full">
        {/* Hour gutter */}
        <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-line bg-surface">
          <div className="h-14 border-b border-line" />
          <div className="relative" style={{ height }}>
            {hours.map((m) => (
              <span key={m} className="absolute right-2 -translate-y-1/2 text-[0.68rem] text-muted tabular" style={{ top: y(m) }}>
                {m === dayStart ? "" : hourLabel(m)}
              </span>
            ))}
          </div>
        </div>

        {columns.map((col) => {
          const colAppts = appointments.filter(
            (a) =>
              a.staffId === col.staffId &&
              a.status !== "cancelled" &&
              new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(a.startsAt)) === col.dateKey,
          );
          const colBlocks = timeOff.filter(
            (b) =>
              (b.staffId === null || b.staffId === col.staffId) &&
              new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(b.startsAt)) <= col.dateKey &&
              new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(b.endsAt)) >= col.dateKey,
          );
          // Off-hours = everything outside the column's working windows.
          const windows = [...col.hours].sort((a, b) => a.start - b.start);
          const off: { start: number; end: number }[] = [];
          let cursor = dayStart;
          for (const w of windows) {
            if (w.start > cursor) off.push({ start: cursor, end: Math.min(w.start, dayEnd) });
            cursor = Math.max(cursor, w.end);
          }
          if (cursor < dayEnd) off.push({ start: cursor, end: dayEnd });

          return (
            <div key={col.key} className="min-w-44 flex-1 border-r border-line last:border-r-0 sm:min-w-52">
              <div className="flex h-14 flex-col justify-center border-b border-line px-3">
                <span className="truncate text-sm font-medium">{col.label}</span>
                {col.sublabel && <span className="truncate text-xs text-muted">{col.sublabel}</span>}
              </div>
              <div className="relative" style={{ height }}>
                {hours.map((m) => (
                  <div key={m} className="absolute inset-x-0 border-t border-line/70" style={{ top: y(m) }} />
                ))}
                {off.map((o) => (
                  <div
                    key={o.start}
                    aria-hidden
                    className="absolute inset-x-0 bg-stone/70"
                    style={{ top: y(o.start), height: (o.end - o.start) * PX_PER_MIN }}
                  />
                ))}

                {/* Empty slots open "new appointment" at that time. */}
                {Array.from({ length: Math.floor((dayEnd - dayStart) / SLOT_MIN) }, (_, i) => dayStart + i * SLOT_MIN).map(
                  (m) => {
                    const hh = String(Math.floor(m / 60)).padStart(2, "0");
                    const mm = String(m % 60).padStart(2, "0");
                    return (
                      <Link
                        key={m}
                        href={hrefFor({ panel: "new", appt: null, staff: col.staffId, date: col.dateKey, time: `${hh}:${mm}` })}
                        aria-label={`New appointment, ${col.label}${col.sublabel ? ` ${col.sublabel}` : ""}, ${hh}:${mm}`}
                        className="absolute inset-x-0 z-0 hover:bg-brass/10"
                        style={{ top: y(m), height: SLOT_MIN * PX_PER_MIN }}
                        scroll={false}
                      />
                    );
                  },
                )}

                {colBlocks.map((b) => {
                  const startMin = Math.max(
                    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(b.startsAt)) < col.dateKey
                      ? 0
                      : localMinutes(b.startsAt, timeZone),
                    dayStart,
                  );
                  const endMin = Math.min(
                    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(b.endsAt)) > col.dateKey
                      ? 24 * 60
                      : localMinutes(b.endsAt, timeZone),
                    dayEnd,
                  );
                  if (endMin <= startMin) return null;
                  return (
                    <Link
                      key={b.id}
                      href={hrefFor({ panel: "block", block: b.id, appt: null })}
                      scroll={false}
                      className="absolute inset-x-1 z-10 overflow-hidden rounded-md border border-line-strong/40 bg-[repeating-linear-gradient(135deg,var(--stone),var(--stone)_6px,var(--surface)_6px,var(--surface)_12px)] px-2 py-1 text-xs text-ink-soft"
                      style={{ top: y(startMin), height: (endMin - startMin) * PX_PER_MIN }}
                    >
                      {b.reason || (b.staffId ? "Blocked" : "Closed")}
                    </Link>
                  );
                })}

                {colAppts.map((a) => {
                  const start = localMinutes(a.startsAt, timeZone);
                  const end = localMinutes(a.endsAt, timeZone) || 24 * 60;
                  const hold = localMinutes(a.holdUntil, timeZone) || 24 * 60;
                  const top = y(Math.max(start, dayStart));
                  const h = Math.max((Math.min(end, dayEnd) - Math.max(start, dayStart)) * PX_PER_MIN, 24);
                  return (
                    <div key={a.lineId}>
                      {hold > end && (
                        <div
                          aria-hidden
                          className="absolute inset-x-1 z-10 rounded-b-md bg-line/60"
                          style={{ top: top + h, height: (Math.min(hold, dayEnd) - end) * PX_PER_MIN }}
                        />
                      )}
                      <Link
                        href={hrefFor({ appt: a.id, panel: null })}
                        scroll={false}
                        aria-current={selectedId === a.id ? "true" : undefined}
                        className={cn(
                          "absolute inset-x-1 z-10 flex flex-col overflow-hidden rounded-md border border-line border-l-4 px-2 py-1 text-left shadow-sm transition-shadow hover:shadow-md",
                          STATUS_STYLE[a.status],
                          selectedId === a.id && "ring-2 ring-brass",
                        )}
                        style={{ top, height: h }}
                      >
                        <span className="tabular truncate font-mono text-[0.68rem] text-muted">
                          {formatTime(a.startsAt, timeZone)}
                        </span>
                        <span className="truncate text-sm font-medium">{a.client?.name ?? "Client"}</span>
                        <span className="truncate text-xs text-ink-soft">{a.serviceName}</span>
                      </Link>
                    </div>
                  );
                })}

                {col.dateKey === nowKey && nowMin >= dayStart && nowMin <= dayEnd && (
                  <div aria-hidden className="absolute inset-x-0 z-20 h-0.5 bg-brass" style={{ top: y(nowMin) }}>
                    <span className="absolute -left-1 -top-1 size-2.5 rounded-full bg-brass" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
