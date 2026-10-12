import { describe, expect, it } from "vitest";
import { toNzMobileE164 } from "./phone";

describe("toNzMobileE164", () => {
  it.each([
    ["021 555 0101", "+64215550101"],
    ["022-123-4567", "+64221234567"],
    ["027 1234 567", "+64271234567"],
    ["+64 21 555 0101", "+64215550101"],
    ["0064 21 555 0101", "+64215550101"],
    ["(021) 5550101", "+64215550101"],
  ])("formats %s", (input, expected) => {
    expect(toNzMobileE164(input)).toBe(expected);
  });

  it.each([["09 123 4567"], ["03 555 0101"], ["+61 412 345 678"], ["12345"], [""], [null]])(
    "rejects %s (landline, foreign or invalid)",
    (input) => {
      expect(toNzMobileE164(input)).toBeNull();
    },
  );
});
