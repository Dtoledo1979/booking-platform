// Time zones offered when creating a location (NZ launch market).
export const TIMEZONES = [
  { value: "Pacific/Auckland", label: "New Zealand (Auckland)" },
  { value: "Pacific/Chatham", label: "Chatham Islands" },
] as const;

export const TIMEZONE_VALUES = TIMEZONES.map((t) => t.value) as [string, ...string[]];
