"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import type { CalendarAppointment } from "@/lib/calendar";
import { idle } from "@/lib/form-state";
import { feeCents, formatDate, formatDuration, formatMoney, formatTime, type PolicyTerms } from "@/lib/format";
import { cancelByBusiness, markCompleted, markNoShow, moveAppointment, saveNote, waiveFee } from "./actions";

export type PanelFee = {
  id: string;
  kind: "late_cancel" | "no_show";
  amount_cents: number;
  status: "pending" | "succeeded" | "failed" | "waived" | "refunded";
  refund_requested_at: string | null;
};

const STATUS: Record<CalendarAppointment["status"], { label: string; tone: "success" | "neutral" | "danger" | "warning" }> = {
  pending: { label: "Awaiting card", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  completed: { label: "Completed", tone: "neutral" },
  no_show: { label: "No-show", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

const FEE_STATUS: Record<PanelFee["status"], string> = {
  pending: "to collect",
  succeeded: "paid",
  failed: "payment failed",
  waived: "waived",
  refunded: "refunded",
};

export function AppointmentPanel({
  appointment: a,
  staffName,
  staff,
  timeZone,
  currency,
  policy,
  graceMinutes,
  fees,
  note,
  closeHref,
  nowIso,
}: {
  appointment: CalendarAppointment;
  staffName: string;
  staff: { id: string; display_name: string }[];
  timeZone: string;
  currency: string;
  policy: PolicyTerms | null;
  graceMinutes: number;
  fees: PanelFee[];
  note: string;
  closeHref: string;
  nowIso: string;
}) {
  const [mode, setMode] = useState<"view" | "noshow" | "cancel" | "move">("view");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cancelState, cancelAction] = useActionState(cancelByBusiness, idle);
  const [moveState, moveAction] = useActionState(moveAppointment, idle);
  const [noteState, noteAction] = useActionState(saveNote, idle);

  const now = new Date(nowIso);
  const started = now >= new Date(a.startsAt);
  const noShowAllowed = now.getTime() >= new Date(a.startsAt).getTime() + graceMinutes * 60000;
  const noShowFee =
    policy && a.policyAccepted ? feeCents(policy.no_show_fee_type, policy.no_show_fee_value, a.priceCents) : 0;
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(a.startsAt));
  const localTime = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(
    new Date(a.startsAt),
  );
  const status = STATUS[a.status];

  const run = (fn: () => Promise<{ error?: string }>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.error) setError(res.error);
      else setMode("view");
    });

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-2xl leading-tight">{a.client?.name ?? "Client"}</p>
          <p className="text-sm text-muted">
            {a.source === "staff" ? "Booked by the team" : "Booked online"}
          </p>
        </div>
        <Link href={closeHref} scroll={false} className={buttonClasses("ghost", "sm")} aria-label="Close details">
          ✕
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={status.tone}>
          {a.status === "cancelled" && a.cancelledBy === "business" ? "Cancelled by you" : status.label}
        </Badge>
        {!a.policyAccepted && <Badge>Policy not accepted — no fees</Badge>}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted">When</dt>
        <dd>
          {formatDate(a.startsAt, timeZone)} ·{" "}
          <span className="tabular font-mono">
            {formatTime(a.startsAt, timeZone)}–{formatTime(a.endsAt, timeZone)}
          </span>
        </dd>
        <dt className="text-muted">Service</dt>
        <dd>
          {a.serviceName} · {formatDuration(Math.round((Date.parse(a.endsAt) - Date.parse(a.startsAt)) / 60000))}
        </dd>
        <dt className="text-muted">With</dt>
        <dd>{staffName}</dd>
        <dt className="text-muted">Price</dt>
        <dd className="tabular font-mono">{formatMoney(a.priceCents, currency)}</dd>
        {a.client?.phone && (
          <>
            <dt className="text-muted">Phone</dt>
            <dd>
              <a href={`tel:${a.client.phone.replace(/\s/g, "")}`} className="underline underline-offset-2">
                {a.client.phone}
              </a>
            </dd>
          </>
        )}
        {a.client?.email && (
          <>
            <dt className="text-muted">Email</dt>
            <dd className="truncate">
              <a href={`mailto:${a.client.email}`} className="underline underline-offset-2">
                {a.client.email}
              </a>
            </dd>
          </>
        )}
      </dl>

      {a.notesFromClient && (
        <p className="rounded-control bg-stone px-3.5 py-2.5 text-sm">
          <span className="font-medium">Client note: </span>
          {a.notesFromClient}
        </p>
      )}

      {fees.length > 0 && (
        <ul className="flex flex-col gap-2 border-t border-line pt-4">
          {fees.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {f.kind === "no_show" ? "No-show fee" : "Late cancellation fee"}{" "}
                <span className="tabular font-mono">{formatMoney(f.amount_cents, currency)}</span>
                <span className="text-muted">
                  {" "}
                  · {f.refund_requested_at && f.status === "succeeded" ? "refund requested" : FEE_STATUS[f.status]}
                </span>
              </span>
              {(f.status === "pending" || f.status === "failed" || (f.status === "succeeded" && !f.refund_requested_at)) && (
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => waiveFee(f.id))}>
                  {f.status === "succeeded" ? "Refund" : "Waive"}
                </Button>
              )}
            </li>
          ))}
          <li className="text-xs text-muted">Fees are collected automatically once payouts are connected.</li>
        </ul>
      )}

      {error && (
        <p role="alert" className="rounded-control bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      {/* ---- Actions ---- */}
      {mode === "view" && (a.status === "confirmed" || a.status === "no_show") && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {a.status === "confirmed" && (
            <>
              <Button size="sm" disabled={pending || !started} onClick={() => run(() => markCompleted(a.id))}>
                Mark completed
              </Button>
              <Button variant="secondary" size="sm" disabled={pending || !noShowAllowed} onClick={() => setMode("noshow")}>
                No-show
              </Button>
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => setMode("move")}>
                Move
              </Button>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setMode("cancel")}>
                Cancel
              </Button>
            </>
          )}
          {a.status === "no_show" && (
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => markCompleted(a.id))}>
              They came — undo no-show
            </Button>
          )}
          {a.status === "confirmed" && !noShowAllowed && (
            <p className="w-full text-xs text-muted">
              No-show can be recorded {graceMinutes} min after the start time.
            </p>
          )}
        </div>
      )}

      {mode === "noshow" && (
        <div className="flex flex-col gap-3 rounded-control border border-line-strong p-4" role="group" aria-label="Record no-show">
          <p className="text-sm">
            {noShowFee > 0 ? (
              <>
                The policy the client accepted allows a no-show fee of{" "}
                <strong className="tabular font-mono">{formatMoney(noShowFee, currency)}</strong>.
              </>
            ) : (
              "No fee applies to this appointment."
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {noShowFee > 0 && (
              <Button variant="danger" size="sm" disabled={pending} onClick={() => run(() => markNoShow(a.id, true))}>
                Charge {formatMoney(noShowFee, currency)}
              </Button>
            )}
            <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => markNoShow(a.id, false))}>
              {noShowFee > 0 ? "Don't charge" : "Record no-show"}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setMode("view")}>
              Back
            </Button>
          </div>
        </div>
      )}

      {mode === "cancel" && (
        <form action={cancelAction} className="flex flex-col gap-3 rounded-control border border-line-strong p-4">
          <FormMessage status={cancelState.status} message={cancelState.message} />
          <input type="hidden" name="appointmentId" value={a.id} />
          <Field
            label="Reason (sent to the client)"
            htmlFor="reason"
            hint="The client is never charged when you cancel."
            error={cancelState.fieldErrors?.reason?.[0]}
          >
            <Textarea id="reason" name="reason" rows={2} defaultValue={cancelState.values?.reason} required />
          </Field>
          <div className="flex gap-2">
            <SubmitButton variant="danger" size="sm" pendingLabel="Cancelling…">
              Cancel appointment
            </SubmitButton>
            <Button variant="ghost" size="sm" onClick={() => setMode("view")}>
              Back
            </Button>
          </div>
        </form>
      )}

      {mode === "move" && (
        <form action={moveAction} className="flex flex-col gap-3 rounded-control border border-line-strong p-4">
          <FormMessage status={moveState.status} message={moveState.message} />
          <input type="hidden" name="appointmentId" value={a.id} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="move-date" error={moveState.fieldErrors?.date?.[0]}>
              <Input id="move-date" name="date" type="date" defaultValue={moveState.values?.date ?? localDate} required />
            </Field>
            <Field label="Time" htmlFor="move-time" error={moveState.fieldErrors?.time?.[0]}>
              <Input id="move-time" name="time" type="time" step={300} defaultValue={moveState.values?.time ?? localTime} required />
            </Field>
          </div>
          <Field label="With" htmlFor="move-staff">
            <Select id="move-staff" name="staffId" defaultValue={moveState.values?.staffId ?? a.staffId}>
              {staff.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2">
            <SubmitButton size="sm" pendingLabel="Moving…">
              Move appointment
            </SubmitButton>
            <Button variant="ghost" size="sm" onClick={() => setMode("view")}>
              Back
            </Button>
          </div>
        </form>
      )}

      <form action={noteAction} className="flex flex-col gap-2 border-t border-line pt-4">
        <input type="hidden" name="appointmentId" value={a.id} />
        <Field label="Internal note" htmlFor="note" hint="Only your team sees this.">
          <Textarea id="note" name="body" rows={2} defaultValue={noteState.values?.body ?? note} />
        </Field>
        <div className="flex items-center gap-3">
          <SubmitButton variant="secondary" size="sm" pendingLabel="Saving…">
            Save note
          </SubmitButton>
          {noteState.status !== "idle" && (
            <span className={noteState.status === "error" ? "text-sm text-danger" : "text-sm text-success"}>
              {noteState.message}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
