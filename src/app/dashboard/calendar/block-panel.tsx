"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import type { CalendarBlock } from "@/lib/calendar";
import { idle } from "@/lib/form-state";
import { formatDate, formatTime } from "@/lib/format";
import { createTimeOff, deleteTimeOff } from "./actions";

// Create a block (break, day off, closure) or review/remove an existing one.
export function BlockPanel({
  block,
  staff,
  allowWholeLocation = true,
  timeZone,
  defaults,
  closeHref,
}: {
  block: CalendarBlock | null;
  staff: { id: string; display_name: string }[];
  allowWholeLocation?: boolean;
  timeZone: string;
  defaults: { staffId: string; date: string };
  closeHref: string;
}) {
  const [state, action] = useActionState(createTimeOff, idle);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const v = (name: string) => state.values?.[name];
  const err = (name: string) => state.fieldErrors?.[name]?.[0];

  const header = (
    <div className="flex items-start justify-between gap-3">
      <h2 className="font-display text-2xl leading-tight">{block ? "Blocked time" : "Block time"}</h2>
      <Link href={closeHref} scroll={false} className={buttonClasses("ghost", "sm")} aria-label="Close">
        ✕
      </Link>
    </div>
  );

  if (block) {
    const who = block.staffId ? (staff.find((m) => m.id === block.staffId)?.display_name ?? "Team member") : "Whole location";
    return (
      <Card className="flex flex-col gap-4">
        {header}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Who</dt>
          <dd>{who}</dd>
          <dt className="text-muted">From</dt>
          <dd>
            {formatDate(block.startsAt, timeZone, "short")}, <span className="tabular font-mono">{formatTime(block.startsAt, timeZone)}</span>
          </dd>
          <dt className="text-muted">To</dt>
          <dd>
            {formatDate(block.endsAt, timeZone, "short")}, <span className="tabular font-mono">{formatTime(block.endsAt, timeZone)}</span>
          </dd>
          {block.reason && (
            <>
              <dt className="text-muted">Reason</dt>
              <dd>{block.reason}</dd>
            </>
          )}
        </dl>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button
          variant="danger"
          size="sm"
          className="self-start"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await deleteTimeOff(block.id);
              if (res.error) setError(res.error);
            })
          }
        >
          {pending ? "Removing…" : "Remove block"}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-5">
      {header}
      <form action={action} className="flex flex-col gap-4" noValidate>
        <FormMessage status={state.status} message={state.message} />
        <Field label="Who" htmlFor="block-staff">
          <Select id="block-staff" name="staffId" defaultValue={v("staffId") ?? defaults.staffId}>
            {staff.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
            {allowWholeLocation && <option value="">Whole location (closed)</option>}
          </Select>
        </Field>
        <Field label="Date" htmlFor="block-date" error={err("date")}>
          <Input id="block-date" name="date" type="date" defaultValue={v("date") ?? defaults.date} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From" htmlFor="block-start" error={err("start")}>
            <Input id="block-start" name="start" type="time" step={300} defaultValue={v("start") ?? "12:00"} required />
          </Field>
          <Field label="To" htmlFor="block-end" error={err("end")}>
            <Input id="block-end" name="end" type="time" step={300} defaultValue={v("end") ?? "13:00"} required />
          </Field>
        </div>
        <Field label="Reason" htmlFor="block-reason" hint="Optional, e.g. Lunch, Training, Public holiday.">
          <Input id="block-reason" name="reason" defaultValue={v("reason")} />
        </Field>
        <p className="text-xs text-muted">Clients can&apos;t book over blocked time. Existing appointments stay as they are.</p>
        <SubmitButton size="lg" pendingLabel="Saving…">
          Block time
        </SubmitButton>
      </form>
    </Card>
  );
}
