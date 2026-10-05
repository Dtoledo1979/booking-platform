// Time-zone math for calendar views. Everything is keyed by the location's
// IANA zone, so it is correct across daylight-saving changes and no matter
// where the server or the viewer is.

// Offset (minutes) of `timeZone` from UTC at a given instant.
function offsetMinutes(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

// Local wall-clock time (YYYY-MM-DD + HH:MM) in a zone → UTC instant.
export function zonedTimeToUtc(dateKey: string, time: string, timeZone: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes settle the offset on DST transition days.
  let utc = naive - offsetMinutes(new Date(naive), timeZone) * 60000;
  utc = naive - offsetMinutes(new Date(utc), timeZone) * 60000;
  return new Date(utc);
}

// [start, end) of a local calendar day, as UTC ISO strings.
export function dayRangeUtc(dateKey: string, timeZone: string, days = 1) {
  const start = zonedTimeToUtc(dateKey, "00:00", timeZone);
  const end = zonedTimeToUtc(addDaysKey(dateKey, days), "00:00", timeZone);
  return { start: start.toISOString(), end: end.toISOString() };
}

// Minutes since local midnight of an instant (for positioning on a grid).
export function localMinutes(iso: string | Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return get("hour") * 60 + get("minute");
}

export function addDaysKey(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 0 = Sunday, matching the database's weekday columns.
export function weekdayOf(dateKey: string) {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}

// Monday of the week containing dateKey.
export function startOfWeekKey(dateKey: string) {
  const wd = weekdayOf(dateKey);
  return addDaysKey(dateKey, wd === 0 ? -6 : 1 - wd);
}

export const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
