"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

// Submit button that disables itself and shows progress while its form's
// server action runs.
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} {...props}>
      {pending ? (pendingLabel ?? "Saving…") : children}
    </Button>
  );
}

export function FormMessage({ status, message }: { status: string; message?: string }) {
  if (!message || status === "idle") return null;
  return (
    <p
      role={status === "error" ? "alert" : "status"}
      className={
        status === "error"
          ? "rounded-control bg-danger/10 px-3.5 py-2.5 text-sm text-danger"
          : "rounded-control bg-success/10 px-3.5 py-2.5 text-sm text-success"
      }
    >
      {message}
    </p>
  );
}
