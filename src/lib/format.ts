import { brand } from "@/config/brand";

export function formatMoney(cents: number, currency: string = brand.currency) {
  return new Intl.NumberFormat(brand.locale, { style: "currency", currency }).format(cents / 100);
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ");
}

// All appointment times are shown in the location's time zone, never the
// viewer's: a client in Sydney booking an Auckland salon sees salon time.
export function formatTime(iso: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat(brand.locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatDate(iso: string | Date, timeZone: string, style: "long" | "short" = "long") {
  return new Intl.DateTimeFormat(brand.locale, {
    timeZone,
    weekday: style === "long" ? "long" : "short",
    day: "numeric",
    month: style === "long" ? "long" : "short",
  }).format(new Date(iso));
}

// YYYY-MM-DD of an instant in a given time zone.
export function localDateKey(iso: string | Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
  return parts; // en-CA formats as YYYY-MM-DD
}

export function addDays(dateKey: string, days: number) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

type FeeType = "none" | "fixed" | "percent";
export type PolicyTerms = {
  free_cancellation_hours: number;
  late_cancel_fee_type: FeeType;
  late_cancel_fee_value: number;
  no_show_fee_type: FeeType;
  no_show_fee_value: number;
};

function feeText(type: FeeType, value: number, priceCents: number | null, currency: string) {
  if (type === "none") return null;
  if (type === "fixed") return formatMoney(Math.min(value, priceCents ?? value), currency);
  if (priceCents === null) return `${value}% of the price`;
  return `${value}% of the price (${formatMoney(Math.min(Math.round((priceCents * value) / 100), priceCents), currency)})`;
}

// Plain-language policy shown before booking and in confirmations
// (docs/03). Mirrors private.fee_cents: a fee never exceeds the price.
export function policySentences(policy: PolicyTerms, priceCents: number | null, currency: string = brand.currency) {
  const hours = policy.free_cancellation_hours;
  const window = hours % 24 === 0 && hours >= 24 ? `${hours / 24} day${hours === 24 ? "" : "s"}` : `${hours} hours`;
  const late = feeText(policy.late_cancel_fee_type, policy.late_cancel_fee_value, priceCents, currency);
  const noShow = feeText(policy.no_show_fee_type, policy.no_show_fee_value, priceCents, currency);
  return [
    late ? `Free cancellation up to ${window} before your appointment.` : "Free cancellation at any time.",
    late && `Later cancellations: ${late}.`,
    noShow && `Not showing up: ${noShow}.`,
  ].filter(Boolean) as string[];
}

// Same rule as private.fee_cents in the database (the server stays the
// source of truth; this is for showing the amount before staff confirm).
export function feeCents(type: FeeType, value: number, priceCents: number) {
  if (type === "none") return 0;
  if (type === "fixed") return Math.min(value, priceCents);
  return Math.min(Math.round((priceCents * value) / 100), priceCents);
}
