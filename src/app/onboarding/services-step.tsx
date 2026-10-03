"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage, SubmitButton } from "@/components/ui/submit-button";
import { brand } from "@/config/brand";
import { idle } from "@/lib/form-state";
import { addService, removeService } from "./actions";

export type ServiceRow = { id: string; name: string; duration_minutes: number; price_cents: number };

const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240];

const money = new Intl.NumberFormat(brand.locale, { style: "currency", currency: brand.currency });

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ");
}

export function ServicesStep({ services }: { services: ServiceRow[] }) {
  const [state, action] = useActionState(addService, idle);
  const [removing, startRemove] = useTransition();
  const err = (name: string) => state.fieldErrors?.[name]?.[0];
  const keepValues = state.status === "error";
  const val = (name: string) => (keepValues ? state.values?.[name] : undefined);

  return (
    <div className="flex flex-col gap-6">
      {services.length > 0 && (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {services.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{s.name}</span>
                  <span className="block text-sm text-muted">{formatDuration(s.duration_minutes)}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="tabular font-mono text-sm">{money.format(s.price_cents / 100)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removing}
                    onClick={() => startRemove(() => removeService(s.id))}
                    aria-label={`Remove ${s.name}`}
                  >
                    Remove
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        {/* key resets the form after each successful add */}
        <form key={services.length} action={action} className="flex flex-col gap-4" noValidate>
          <FormMessage status={state.status} message={state.message} />
          <Field label="Service" htmlFor="name" error={err("name")}>
            <Input
              id="name"
              name="name"
              defaultValue={val("name")}
              placeholder="e.g. Skin fade, Gel manicure, Blow-dry"
              required
              aria-invalid={!!err("name")}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Duration" htmlFor="duration" error={err("duration")}>
              <Select id="duration" name="duration" defaultValue={val("duration") ?? "45"}>
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {formatDuration(d)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`Price (${brand.currency})`} htmlFor="price" error={err("price")}>
              <Input
                id="price"
                name="price"
                inputMode="decimal"
                defaultValue={val("price")}
                placeholder="65"
                className="tabular font-mono"
                required
                aria-invalid={!!err("price")}
              />
            </Field>
          </div>
          <SubmitButton variant="secondary" pendingLabel="Adding…">
            Add service
          </SubmitButton>
        </form>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {services.length ? `${services.length} service${services.length === 1 ? "" : "s"} added` : "Add at least one service"}
        </p>
        {services.length > 0 ? (
          <Link href="/onboarding?step=hours" className={buttonClasses("primary", "lg")}>
            Continue
          </Link>
        ) : (
          <span className={buttonClasses("primary", "lg", "pointer-events-none opacity-40")} aria-disabled>
            Continue
          </span>
        )}
      </div>
    </div>
  );
}
