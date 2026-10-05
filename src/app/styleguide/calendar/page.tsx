import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppointmentPanel } from "@/app/dashboard/calendar/appointment-panel";
import { CalendarGrid, type Column } from "@/app/dashboard/calendar/calendar-grid";
import type { CalendarAppointment } from "@/lib/calendar";
import { localDateKey } from "@/lib/format";
import { zonedTimeToUtc } from "@/lib/time";

export const metadata: Metadata = { title: "Calendar preview", robots: { index: false } };

const TZ = "Pacific/Auckland";

// Calendar with sample data, reviewable without signing in. Development
// only; actions are not wired to real appointments.
export default function CalendarPreview() {
  if (process.env.NODE_ENV !== "development") notFound();

  const day = localDateKey(new Date(), TZ);
  const at = (t: string) => zonedTimeToUtc(day, t, TZ).toISOString();
  const appt = (
    id: string,
    staffId: string,
    start: string,
    end: string,
    name: string,
    service: string,
    status: CalendarAppointment["status"],
    hold?: string,
  ): CalendarAppointment => ({
    id,
    lineId: `line-${id}`,
    status,
    source: id === "a3" ? "staff" : "online",
    staffId,
    serviceId: "svc",
    serviceName: service,
    startsAt: at(start),
    endsAt: at(end),
    holdUntil: at(hold ?? end),
    priceCents: 8500,
    policyAccepted: id !== "a3",
    cancelledBy: null,
    notesFromClient: id === "a1" ? "Running 5 min late maybe!" : null,
    client: { id: `c-${id}`, name, phone: "021 555 0101", email: null },
  });

  const appointments = [
    appt("a1", "mia", "09:30", "10:30", "Aroha Smith", "Cut & blow-dry", "completed"),
    appt("a2", "mia", "11:00", "12:00", "Chloe Brown", "Gel manicure", "confirmed", "12:15"),
    appt("a3", "rangi", "10:00", "10:45", "Liam Wilson", "Skin fade", "confirmed"),
    appt("a4", "rangi", "14:00", "14:45", "Noah Taylor", "Skin fade", "no_show"),
    appt("a5", "rangi", "15:30", "16:30", "Sam Lee", "Cut & blow-dry", "pending"),
  ];
  const columns: Column[] = [
    { key: "mia", label: "Mia", dateKey: day, staffId: "mia", hours: [{ start: 540, end: 1020 }] },
    { key: "rangi", label: "Rangi", dateKey: day, staffId: "rangi", hours: [{ start: 600, end: 1080 }] },
  ];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6">
      <h1 className="font-display text-3xl">Calendar preview</h1>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <CalendarGrid
          columns={columns}
          appointments={appointments}
          timeOff={[{ id: "b1", staffId: "mia", startsAt: at("13:00"), endsAt: at("13:45"), reason: "Lunch" }]}
          timeZone={TZ}
          dayStart={480}
          dayEnd={1140}
          hrefFor={() => "/styleguide/calendar"}
          selectedId="a2"
          nowIso={new Date().toISOString()}
        />
        <AppointmentPanel
          appointment={appointments[1]}
          staffName="Mia"
          staff={[
            { id: "mia", display_name: "Mia" },
            { id: "rangi", display_name: "Rangi" },
          ]}
          timeZone={TZ}
          currency="NZD"
          policy={{
            free_cancellation_hours: 24,
            late_cancel_fee_type: "percent",
            late_cancel_fee_value: 50,
            no_show_fee_type: "percent",
            no_show_fee_value: 100,
          }}
          graceMinutes={15}
          fees={[]}
          note="Prefers a quiet appointment."
          closeHref="/styleguide/calendar"
          nowIso={new Date().toISOString()}
        />
      </div>
    </main>
  );
}
