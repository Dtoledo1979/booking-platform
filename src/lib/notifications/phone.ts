// NZ mobile numbers → E.164 for SMS. Only mobiles (02x) can receive texts;
// landlines and anything unrecognised return null and the SMS is skipped.
//   "021 555 0101" → "+64215550101"     "+64 21 555 0101" → "+64215550101"
//   "0064 21…"      → "+6421…"           "09 123 4567"     → null (landline)
export function toNzMobileE164(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `64${digits.slice(1)}`;

  // 64 + 2 + 7–9 more digits.
  return /^642\d{7,9}$/.test(digits) ? `+${digits}` : null;
}
