import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-card border border-line bg-surface p-5 sm:p-6", className)}
      {...props}
    />
  );
}

type Tone = "neutral" | "brass" | "success" | "danger" | "warning";

const tones: Record<Tone, string> = {
  neutral: "bg-stone text-ink-soft",
  brass: "bg-brass/12 text-brass-ink",
  success: "bg-success/10 text-success",
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning/10 text-warning",
};

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

// Small uppercase label with a brass rule — the signature detail of the identity.
export function Eyebrow({ className, children, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "flex items-center gap-3 text-xs font-medium uppercase tracking-[0.18em] text-brass-ink",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="h-px w-6 bg-brass" />
      {children}
    </p>
  );
}
