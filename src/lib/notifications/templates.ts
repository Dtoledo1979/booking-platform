import { brand } from "@/config/brand";
import { formatDate, formatMoney, formatTime } from "@/lib/format";

export type MessageKind =
  | "booking_confirmed"
  | "booking_changed"
  | "booking_cancelled"
  | "reminder_free_window"
  | "reminder_upcoming"
  | "business_new_booking"
  | "business_cancelled";

// Everything a message can mention, gathered by the dispatcher at send time
// so it reflects the appointment as it is now.
export type MessageData = {
  siteUrl: string;
  location: { name: string; slug: string; timezone: string; currency: string; address: string | null; phone: string | null };
  client: { firstName: string; fullName: string; phone: string | null; email: string | null };
  appointment: {
    services: string;
    staffName: string | null;
    startsAt: string;
    priceCents: number;
    freeUntil: string | null; // null when cancelling is always free
    lateFeeCents: number;
    cancelledBy: "client" | "business" | "system" | null;
    cancellationReason: string | null;
    feeChargedCents: number; // late-cancellation fee created by this cancellation
  };
};

export type EmailMessage = { subject: string; text: string; html: string };

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function when(d: MessageData, style: "long" | "short" = "long") {
  const tz = d.location.timezone;
  return `${formatDate(d.appointment.startsAt, tz, style)} at ${formatTime(d.appointment.startsAt, tz)}`;
}

function freeUntilText(d: MessageData) {
  const f = d.appointment.freeUntil;
  if (!f) return null;
  return `${formatDate(f, d.location.timezone, "short")}, ${formatTime(f, d.location.timezone)}`;
}

const manageUrl = (d: MessageData) => `${d.siteUrl}/my-bookings`;
const bookAgainUrl = (d: MessageData) => `${d.siteUrl}/${d.location.slug}`;
const calendarUrl = (d: MessageData) => `${d.siteUrl}/dashboard/calendar`;

// ---------- SMS (kept short: one or two segments) ----------

export function renderSms(kind: MessageKind, d: MessageData): string | null {
  const loc = d.location.name;
  const a = d.appointment;
  const free = freeUntilText(d);
  switch (kind) {
    case "booking_confirmed":
      return `${loc}: you're booked for ${a.services}, ${when(d, "short")}.${free ? ` Free to cancel until ${free}.` : ""} Manage: ${manageUrl(d)}`;
    case "booking_changed":
      return `${loc}: your booking has moved to ${when(d, "short")}. Manage: ${manageUrl(d)}`;
    case "booking_cancelled":
      if (a.cancelledBy === "business") {
        return `${loc}: sorry, we've had to cancel your ${when(d, "short")} booking${a.cancellationReason ? ` (${a.cancellationReason})` : ""}. Rebook: ${bookAgainUrl(d)}`;
      }
      return `${loc}: your ${when(d, "short")} booking is cancelled.${a.feeChargedCents ? ` Late-cancellation fee: ${formatMoney(a.feeChargedCents, d.location.currency)}.` : ""}`;
    case "reminder_free_window":
      return `${loc}: reminder — ${a.services}, ${when(d, "short")}.${free && a.lateFeeCents ? ` Free to change until ${free}; after that a ${formatMoney(a.lateFeeCents, d.location.currency)} fee applies.` : ""} Manage: ${manageUrl(d)}`;
    case "reminder_upcoming":
      return `${loc}: see you at ${formatTime(a.startsAt, d.location.timezone)} today${d.location.address ? `, ${d.location.address}` : ""}.`;
    default:
      return null; // business notices go by email only
  }
}

// ---------- Email ----------

function layout(title: string, paragraphs: string[], cta: { label: string; url: string } | null, footer: string) {
  const ink = "#17191b";
  const brass = "#9c7a45";
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#3a3d40">${p}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0 6px"><a href="${escape(cta.url)}" style="display:inline-block;background:${ink};color:#f7f5f2;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:15px">${escape(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f7f5f2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f2;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #dedad3;border-radius:16px;padding:32px">
<tr><td>
<p style="margin:0 0 18px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:${brass}">${escape(footer)}</p>
<h1 style="margin:0 0 18px;font-family:Georgia,serif;font-weight:400;font-size:28px;line-height:1.15;color:${ink}">${escape(title)}</h1>
${body}${button}
</td></tr></table>
<p style="margin:18px 0 0;font-size:12px;color:#6b675f">Sent by ${escape(brand.name)} on behalf of ${escape(footer)}.</p>
</td></tr></table></body></html>`;
}

// Paragraph builders take plain text and escape it; <strong> is added here.
const strong = (s: string) => `<strong style="color:#17191b">${escape(s)}</strong>`;

export function renderEmail(kind: MessageKind, d: MessageData): EmailMessage | null {
  const loc = d.location.name;
  const a = d.appointment;
  const free = freeUntilText(d);
  const withStaff = a.staffName ? ` with ${a.staffName}` : "";
  const price = formatMoney(a.priceCents, d.location.currency);
  const where = d.location.address ? `${loc}, ${d.location.address}` : loc;

  const details = [
    `${strong(a.services)}${escape(withStaff)}`,
    `${strong(when(d))}`,
    escape(where),
    `${escape(price)}`,
  ].join("<br>");
  const detailsText = [`${a.services}${withStaff}`, when(d), where, price].join("\n");

  const build = (subject: string, title: string, lines: string[], textLines: string[], cta: { label: string; url: string } | null) => ({
    subject,
    html: layout(title, lines, cta, loc),
    text: [title, "", ...textLines, ...(cta ? ["", `${cta.label}: ${cta.url}`] : [])].join("\n"),
  });

  switch (kind) {
    case "booking_confirmed":
      return build(
        `You're booked at ${loc} — ${when(d, "short")}`,
        `See you soon, ${d.client.firstName}.`,
        [details, free ? `Free to cancel or change until ${strong(free)}.` : "You can cancel or change at any time."],
        [detailsText, "", free ? `Free to cancel or change until ${free}.` : "You can cancel or change at any time."],
        { label: "Manage booking", url: manageUrl(d) },
      );
    case "booking_changed":
      return build(
        `Your booking at ${loc} has changed`,
        "Your booking has moved.",
        [`Here are the new details:`, details],
        ["Here are the new details:", detailsText],
        { label: "Manage booking", url: manageUrl(d) },
      );
    case "booking_cancelled":
      if (a.cancelledBy === "business") {
        return build(
          `${loc} cancelled your booking`,
          "We're sorry — your booking was cancelled.",
          [
            `${loc} had to cancel ${strong(when(d))}.`,
            a.cancellationReason ? `Reason: ${escape(a.cancellationReason)}` : "",
            "You haven't been charged.",
          ].filter(Boolean),
          [`${loc} had to cancel ${when(d)}.`, a.cancellationReason ? `Reason: ${a.cancellationReason}` : "", "You haven't been charged."].filter(Boolean),
          { label: "Book another time", url: bookAgainUrl(d) },
        );
      }
      return build(
        `Booking cancelled — ${loc}`,
        "Your booking is cancelled.",
        [
          `${escape(a.services)} on ${strong(when(d))} has been cancelled.`,
          a.feeChargedCents
            ? `A late-cancellation fee of ${strong(formatMoney(a.feeChargedCents, d.location.currency))} applies, as per the policy you accepted.`
            : "No fee applies.",
        ],
        [
          `${a.services} on ${when(d)} has been cancelled.`,
          a.feeChargedCents ? `A late-cancellation fee of ${formatMoney(a.feeChargedCents, d.location.currency)} applies.` : "No fee applies.",
        ],
        { label: "Book again", url: bookAgainUrl(d) },
      );
    case "reminder_free_window":
      return build(
        `Reminder: ${loc}, ${when(d, "short")}`,
        `Coming up, ${d.client.firstName}.`,
        [
          details,
          free && a.lateFeeCents
            ? `Need to change it? It's free until ${strong(free)}. After that, a ${strong(formatMoney(a.lateFeeCents, d.location.currency))} late-cancellation fee applies.`
            : "Need to change it? You can do it online.",
        ],
        [
          detailsText,
          "",
          free && a.lateFeeCents
            ? `Free to change until ${free}. After that, a ${formatMoney(a.lateFeeCents, d.location.currency)} fee applies.`
            : "Need to change it? You can do it online.",
        ],
        { label: "Manage booking", url: manageUrl(d) },
      );
    case "business_new_booking":
      return build(
        `New booking: ${d.client.fullName} — ${when(d, "short")}`,
        "New online booking",
        [
          `${strong(d.client.fullName)} booked ${escape(a.services)}${escape(withStaff)}.`,
          strong(when(d)),
          [d.client.phone, d.client.email].filter(Boolean).map((s) => escape(s!)).join(" · "),
        ].filter(Boolean),
        [`${d.client.fullName} booked ${a.services}${withStaff}.`, when(d), [d.client.phone, d.client.email].filter(Boolean).join(" · ")],
        { label: "Open calendar", url: calendarUrl(d) },
      );
    case "business_cancelled":
      return build(
        `Cancelled: ${d.client.fullName} — ${when(d, "short")}`,
        "A client cancelled",
        [
          `${strong(d.client.fullName)} cancelled ${escape(a.services)} on ${strong(when(d))}.`,
          a.feeChargedCents
            ? `Late-cancellation fee: ${strong(formatMoney(a.feeChargedCents, d.location.currency))}.`
            : "It was inside the free-cancellation window, so no fee applies.",
        ],
        [
          `${d.client.fullName} cancelled ${a.services} on ${when(d)}.`,
          a.feeChargedCents ? `Late-cancellation fee: ${formatMoney(a.feeChargedCents, d.location.currency)}.` : "No fee applies.",
        ],
        { label: "Open calendar", url: calendarUrl(d) },
      );
    default:
      return null; // reminder_upcoming is SMS only
  }
}
