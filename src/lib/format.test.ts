import { describe, expect, it } from "vitest";
import { feeCents, policySentences } from "./format";

describe("feeCents (mirrors private.fee_cents)", () => {
  it("charges nothing for 'none'", () => expect(feeCents("none", 0, 8500)).toBe(0));
  it("takes a percentage of the price", () => expect(feeCents("percent", 50, 8500)).toBe(4250));
  it("rounds half-cents like Postgres round()", () => expect(feeCents("percent", 50, 8501)).toBe(4251));
  it("never exceeds the price (fixed)", () => expect(feeCents("fixed", 10000, 4500)).toBe(4500));
  it("never exceeds the price (percent)", () => expect(feeCents("percent", 100, 4500)).toBe(4500));
});

describe("policySentences", () => {
  const policy = {
    free_cancellation_hours: 24,
    late_cancel_fee_type: "percent" as const,
    late_cancel_fee_value: 50,
    no_show_fee_type: "percent" as const,
    no_show_fee_value: 100,
  };

  it("states the window and the amounts for a known price", () => {
    expect(policySentences(policy, 8500, "NZD")).toEqual([
      "Free cancellation up to 1 day before your appointment.",
      "Later cancellations: 50% of the price ($42.50).",
      "Not showing up: 100% of the price ($85.00).",
    ]);
  });

  it("says cancellation is always free when there is no late fee", () => {
    expect(policySentences({ ...policy, late_cancel_fee_type: "none", late_cancel_fee_value: 0 }, 8500, "NZD")[0]).toBe(
      "Free cancellation at any time.",
    );
  });
});
