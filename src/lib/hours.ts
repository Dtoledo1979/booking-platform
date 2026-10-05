// Parses the weekly hours fields rendered by <WeekHoursFields>:
// open_{weekday}=on, opens_{weekday}=HH:MM, closes_{weekday}=HH:MM.
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type WeekRow = { weekday: number; opens: string; closes: string };

export function parseWeekHours(formData: FormData): { rows: WeekRow[]; fieldErrors: Record<string, string[]> } {
  const rows: WeekRow[] = [];
  const fieldErrors: Record<string, string[]> = {};
  for (let weekday = 0; weekday <= 6; weekday++) {
    if (formData.get(`open_${weekday}`) !== "on") continue;
    const opens = String(formData.get(`opens_${weekday}`) ?? "");
    const closes = String(formData.get(`closes_${weekday}`) ?? "");
    if (!TIME.test(opens) || !TIME.test(closes) || closes <= opens) {
      fieldErrors[`day_${weekday}`] = ["End time must be after start time"];
      continue;
    }
    rows.push({ weekday, opens, closes });
  }
  return { rows, fieldErrors };
}
