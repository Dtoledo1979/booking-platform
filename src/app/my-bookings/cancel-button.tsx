"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { cancelMyAppointment, getCancelQuote } from "./actions";

type Step = { kind: "idle" } | { kind: "confirm"; feeCents: number; currency: string } | { kind: "error"; message: string };

// Two-step cancel: first show the exact fee (or that it's free), then cancel.
export function CancelButton({ appointmentId }: { appointmentId: string }) {
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [pending, start] = useTransition();

  if (step.kind === "confirm") {
    return (
      <div className="flex flex-col gap-3 rounded-control border border-line-strong p-4" role="alertdialog" aria-label="Confirm cancellation">
        <p className="text-sm">
          {step.feeCents > 0 ? (
            <>
              Cancelling now incurs a late-cancellation fee of{" "}
              <strong className="tabular font-mono">{formatMoney(step.feeCents, step.currency)}</strong>, as per the
              policy you accepted.
            </>
          ) : (
            "Cancelling now is free."
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await cancelMyAppointment(appointmentId);
                if (res.error) setStep({ kind: "error", message: res.error });
              })
            }
          >
            {pending ? "Cancelling…" : step.feeCents > 0 ? "Cancel and pay fee" : "Yes, cancel"}
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setStep({ kind: "idle" })}>
            Keep booking
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const quote = await getCancelQuote(appointmentId);
            setStep("error" in quote ? { kind: "error", message: quote.error } : { kind: "confirm", ...quote });
          })
        }
      >
        {pending ? "Checking…" : "Cancel"}
      </Button>
      {step.kind === "error" && <p className="text-sm text-danger">{step.message}</p>}
    </div>
  );
}
