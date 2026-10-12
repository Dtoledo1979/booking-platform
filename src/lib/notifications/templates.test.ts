import { describe, expect, it } from "vitest";
import { renderEmail, renderSms, type MessageData } from "./templates";

const data = (overrides: Partial<MessageData["appointment"]> = {}): MessageData => ({
  siteUrl: "https://example.test",
  location: {
    name: "Demo Studio",
    slug: "demo-studio",
    timezone: "Pacific/Auckland",
    currency: "NZD",
    address: "12 Ponsonby Road, Auckland",
    phone: "09 123 4567",
  },
  client: { firstName: "Chloe", fullName: "Chloe Brown", phone: "021 555 0101", email: "chloe@example.test" },
  appointment: {
    services: "Cut & blow-dry",
    staffName: "Mia",
    startsAt: "2026-10-13T21:30:00Z", // Wed 14 Oct, 10:30 am NZDT
    priceCents: 8500,
    freeUntil: "2026-10-12T21:30:00Z",
    lateFeeCents: 4250,
    cancelledBy: null,
    cancellationReason: null,
    feeChargedCents: 0,
    ...overrides,
  },
});

describe("renderSms", () => {
  it("confirms in the location's time zone with the free-cancellation deadline", () => {
    expect(renderSms("booking_confirmed", data())).toBe(
      "Demo Studio: you're booked for Cut & blow-dry, Wed, 14 Oct at 10:30 am. Free to cancel until Tue, 13 Oct, 10:30 am. Manage: https://example.test/my-bookings",
    );
  });

  it("states the late fee in the free-window reminder", () => {
    expect(renderSms("reminder_free_window", data())).toContain("a $42.50 fee applies");
  });

  it("includes the business's reason when it cancels", () => {
    expect(renderSms("booking_cancelled", data({ cancelledBy: "business", cancellationReason: "Stylist unwell" }))).toContain(
      "(Stylist unwell)",
    );
  });

  it("stays within two SMS segments", () => {
    for (const kind of ["booking_confirmed", "booking_changed", "reminder_free_window", "reminder_upcoming"] as const) {
      expect(renderSms(kind, data())!.length).toBeLessThanOrEqual(306);
    }
  });

  it("doesn't text the business", () => {
    expect(renderSms("business_new_booking", data())).toBeNull();
  });
});

describe("renderEmail", () => {
  it("escapes user-provided text in HTML", () => {
    const email = renderEmail("booking_cancelled", data({ cancelledBy: "business", cancellationReason: "<script>x</script>" }))!;
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.text).toContain("<script>x</script>"); // plain text needs no escaping
  });

  it("mentions the fee charged on a late client cancellation", () => {
    const email = renderEmail("booking_cancelled", data({ cancelledBy: "client", feeChargedCents: 4250 }))!;
    expect(email.text).toContain("$42.50");
  });

  it("gives the business the client's contact details", () => {
    const email = renderEmail("business_new_booking", data())!;
    expect(email.subject).toBe("New booking: Chloe Brown — Wed, 14 Oct at 10:30 am");
    expect(email.text).toContain("021 555 0101");
  });

  it("has no email for the 2-hour reminder (SMS only)", () => {
    expect(renderEmail("reminder_upcoming", data())).toBeNull();
  });
});
