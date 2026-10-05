import { describe, expect, it } from "vitest";
import { addDaysKey, dayRangeUtc, localMinutes, startOfWeekKey, weekdayOf, zonedTimeToUtc } from "./time";

const NZ = "Pacific/Auckland";
const hours = (r: { start: string; end: string }) => (Date.parse(r.end) - Date.parse(r.start)) / 3.6e6;

describe("zonedTimeToUtc", () => {
  it("converts NZ daylight time (UTC+13)", () => {
    expect(zonedTimeToUtc("2026-10-06", "10:30", NZ).toISOString()).toBe("2026-10-05T21:30:00.000Z");
  });

  it("converts NZ standard time (UTC+12)", () => {
    expect(zonedTimeToUtc("2026-07-06", "10:30", NZ).toISOString()).toBe("2026-07-05T22:30:00.000Z");
  });

  it("handles quarter-hour offsets (Chatham Islands, UTC+13:45)", () => {
    expect(zonedTimeToUtc("2026-10-06", "09:00", "Pacific/Chatham").toISOString()).toBe("2026-10-05T19:15:00.000Z");
  });
});

describe("dayRangeUtc", () => {
  it("is 24 hours on an ordinary day", () => {
    expect(hours(dayRangeUtc("2026-10-06", NZ))).toBe(24);
  });

  it("is 23 hours when daylight saving starts", () => {
    expect(hours(dayRangeUtc("2026-09-27", NZ))).toBe(23);
  });

  it("is 25 hours when daylight saving ends", () => {
    expect(hours(dayRangeUtc("2026-04-05", NZ))).toBe(25);
  });

  it("spans several days for week views", () => {
    const week = dayRangeUtc("2026-10-05", NZ, 7);
    expect(week.start).toBe("2026-10-04T11:00:00.000Z");
    expect(hours(week)).toBe(168);
  });
});

describe("local calendar helpers", () => {
  it("places an instant on the local grid", () => {
    expect(localMinutes("2026-10-05T21:30:00Z", NZ)).toBe(10 * 60 + 30);
  });

  it("finds the Monday of a week (Sunday belongs to the week before)", () => {
    expect(startOfWeekKey("2026-10-11")).toBe("2026-10-05");
    expect(startOfWeekKey("2026-10-05")).toBe("2026-10-05");
  });

  it("uses 0 for Sunday like the database", () => {
    expect(weekdayOf("2026-10-11")).toBe(0);
    expect(weekdayOf("2026-10-12")).toBe(1);
  });

  it("adds days across month ends", () => {
    expect(addDaysKey("2026-10-31", 1)).toBe("2026-11-01");
  });
});
