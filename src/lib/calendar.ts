import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { dayRangeUtc } from "@/lib/time";

type Client = SupabaseClient<Database>;

export type CalendarAppointment = {
  id: string; // appointment id
  lineId: string; // appointment_services id
  status: Database["public"]["Enums"]["appointment_status"];
  source: Database["public"]["Enums"]["appointment_source"];
  staffId: string;
  serviceId: string;
  serviceName: string;
  startsAt: string;
  endsAt: string;
  holdUntil: string;
  priceCents: number;
  policyAccepted: boolean;
  cancelledBy: Database["public"]["Enums"]["cancelled_by"] | null;
  notesFromClient: string | null;
  client: { id: string; name: string; phone: string | null; email: string | null } | null;
};

export type CalendarBlock = { id: string; staffId: string | null; startsAt: string; endsAt: string; reason: string | null };

// Appointments (one entry per service line) and time-off blocks that
// overlap the visible local days, read under the staff member's RLS.
export async function loadCalendar(
  supabase: Client,
  locationId: string,
  firstDay: string,
  days: number,
  timeZone: string,
) {
  const range = dayRangeUtc(firstDay, timeZone, days);

  const [lines, blocks] = await Promise.all([
    supabase
      .from("appointment_services")
      .select(
        "id, staff_id, service_id, service_name, starts_at, ends_at, hold_until, price_cents, " +
          "appointments!inner(id, status, source, cancelled_by, policy_accepted_at, notes_from_client, " +
          "location_clients(id, first_name, last_name, phone, email))",
      )
      .eq("location_id", locationId)
      .lt("starts_at", range.end)
      .gt("ends_at", range.start)
      .order("starts_at"),
    supabase
      .from("time_off")
      .select("id, staff_id, starts_at, ends_at, reason")
      .eq("location_id", locationId)
      .lt("starts_at", range.end)
      .gt("ends_at", range.start)
      .order("starts_at"),
  ]);

  type Row = {
    id: string;
    staff_id: string;
    service_id: string;
    service_name: string;
    starts_at: string;
    ends_at: string;
    hold_until: string;
    price_cents: number;
    appointments: {
      id: string;
      status: CalendarAppointment["status"];
      source: CalendarAppointment["source"];
      cancelled_by: CalendarAppointment["cancelledBy"];
      policy_accepted_at: string | null;
      notes_from_client: string | null;
      location_clients: { id: string; first_name: string; last_name: string | null; phone: string | null; email: string | null } | null;
    };
  };

  const appointments: CalendarAppointment[] = ((lines.data ?? []) as unknown as Row[]).map((r) => {
    const a = r.appointments;
    const c = a.location_clients;
    return {
      id: a.id,
      lineId: r.id,
      status: a.status,
      source: a.source,
      staffId: r.staff_id,
      serviceId: r.service_id,
      serviceName: r.service_name,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      holdUntil: r.hold_until,
      priceCents: r.price_cents,
      policyAccepted: Boolean(a.policy_accepted_at),
      cancelledBy: a.cancelled_by,
      notesFromClient: a.notes_from_client,
      client: c ? { id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" "), phone: c.phone, email: c.email } : null,
    };
  });

  const timeOff: CalendarBlock[] = (blocks.data ?? []).map((b) => ({
    id: b.id,
    staffId: b.staff_id,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    reason: b.reason,
  }));

  return { appointments, timeOff, error: lines.error ?? blocks.error };
}
