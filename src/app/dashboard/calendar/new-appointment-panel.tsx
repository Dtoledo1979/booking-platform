"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import { idle } from "@/lib/form-state";
import { formatDuration, formatMoney } from "@/lib/format";
import { createAppointment } from "./actions";

export type ClientOption = { id: string; name: string; phone: string | null; email: string | null };

export function NewAppointmentPanel({
  clients,
  services,
  staff,
  currency,
  defaults,
  closeHref,
}: {
  clients: ClientOption[];
  services: { id: string; name: string; duration_minutes: number; price_cents: number }[];
  staff: { id: string; display_name: string }[];
  currency: string;
  defaults: { staffId: string; date: string; time: string };
  closeHref: string;
}) {
  const [state, action] = useActionState(createAppointment, idle);
  const v = (name: string) => state.values?.[name];
  const err = (name: string) => state.fieldErrors?.[name]?.[0];

  const [query, setQuery] = useState("");
  const [clientId, setClientId] = useState(v("clientId") ?? "");
  const [isNew, setIsNew] = useState(Boolean(v("firstName")) || clients.length === 0);

  // Simple in-memory search: fine for a salon's client list.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 6);
    return clients
      .filter((c) => [c.name, c.phone, c.email].some((f) => f?.toLowerCase().replace(/\s/g, "").includes(q.replace(/\s/g, ""))))
      .slice(0, 8);
  }, [clients, query]);
  const chosen = clients.find((c) => c.id === clientId);

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-2xl leading-tight">New appointment</h2>
        <Link href={closeHref} scroll={false} className={buttonClasses("ghost", "sm")} aria-label="Close">
          ✕
        </Link>
      </div>

      <form action={action} className="flex flex-col gap-4" noValidate>
        <FormMessage status={state.status} message={state.message} />
        <input type="hidden" name="clientId" value={isNew ? "" : clientId} />

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">Client</legend>
          {!isNew ? (
            chosen ? (
              <div className="flex items-center justify-between gap-3 rounded-control border border-line-strong px-3.5 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{chosen.name}</span>
                  <span className="block truncate text-sm text-muted">{chosen.phone ?? chosen.email}</span>
                </span>
                <button type="button" className="text-sm underline underline-offset-2" onClick={() => setClientId("")}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <Input
                  aria-label="Search clients"
                  placeholder="Search by name, phone or email"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <ul className="flex flex-col divide-y divide-line rounded-control border border-line">
                  {matches.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setClientId(c.id)}
                        className="flex w-full flex-col px-3.5 py-2 text-left hover:bg-stone"
                      >
                        <span className="text-sm font-medium">{c.name}</span>
                        <span className="text-xs text-muted">{c.phone ?? c.email ?? "No contact details"}</span>
                      </button>
                    </li>
                  ))}
                  {matches.length === 0 && <li className="px-3.5 py-2 text-sm text-muted">No matching clients.</li>}
                </ul>
                {err("firstName") && <p className="text-sm text-danger">{err("firstName")}</p>}
              </>
            )
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" htmlFor="firstName" error={err("firstName")}>
                <Input id="firstName" name="firstName" defaultValue={v("firstName")} required aria-invalid={!!err("firstName")} />
              </Field>
              <Field label="Last name" htmlFor="lastName">
                <Input id="lastName" name="lastName" defaultValue={v("lastName")} />
              </Field>
              <Field label="Mobile" htmlFor="phone">
                <Input id="phone" name="phone" type="tel" defaultValue={v("phone")} />
              </Field>
              <Field label="Email" htmlFor="email" error={err("email")}>
                <Input id="email" name="email" type="email" defaultValue={v("email")} />
              </Field>
            </div>
          )}
          {clients.length > 0 && (
            <button
              type="button"
              className="self-start text-sm underline underline-offset-2"
              onClick={() => {
                setIsNew((n) => !n);
                setClientId("");
              }}
            >
              {isNew ? "Choose an existing client" : "+ New client"}
            </button>
          )}
        </fieldset>

        <Field label="Service" htmlFor="serviceId" error={err("serviceId")}>
          <Select id="serviceId" name="serviceId" defaultValue={v("serviceId") ?? services[0]?.id}>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {formatDuration(s.duration_minutes)} · {formatMoney(s.price_cents, currency)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="With" htmlFor="staffId" error={err("staffId")}>
          <Select id="staffId" name="staffId" defaultValue={v("staffId") ?? defaults.staffId}>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="date" error={err("date")}>
            <Input id="date" name="date" type="date" defaultValue={v("date") ?? defaults.date} required />
          </Field>
          <Field label="Time" htmlFor="time" error={err("time")}>
            <Input id="time" name="time" type="time" step={300} defaultValue={v("time") ?? defaults.time} required />
          </Field>
        </div>

        <Field label="Internal note" htmlFor="notes" hint="Optional. Only your team sees this.">
          <Textarea id="notes" name="notes" rows={2} defaultValue={v("notes")} />
        </Field>

        <p className="text-xs text-muted">
          Bookings made by your team skip online rules like minimum notice, but never double-book a professional.
          No cancellation fee applies until the client accepts your policy.
        </p>

        <SubmitButton size="lg" pendingLabel="Booking…">
          Book appointment
        </SubmitButton>
      </form>
    </Card>
  );
}
