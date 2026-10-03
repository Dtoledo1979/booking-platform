import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type MyAppointment = Database["public"]["Functions"]["my_appointments"]["Returns"][number];

export async function getMyAppointments(supabase: SupabaseClient<Database>): Promise<MyAppointment[]> {
  const { data } = await supabase.rpc("my_appointments");
  return data ?? [];
}

// Google Calendar "add event" link; needs no OAuth.
export function googleCalendarUrl(a: MyAppointment) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${a.services} — ${a.location_name}`,
    dates: `${stamp(a.starts_at)}/${stamp(a.ends_at)}`,
    details: `Booked with ${a.location_name}${a.staff_name ? ` (with ${a.staff_name})` : ""}.`,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}
