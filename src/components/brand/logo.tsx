import { brand } from "@/config/brand";
import { cn } from "@/lib/cn";

// Provisional mark: the brand initial in the display serif inside a thin
// brass ring. Swap for the real logo once the name is decided.
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-full border border-brass",
        "font-display text-xl leading-none text-ink",
        className,
      )}
    >
      {brand.name.charAt(0)}
    </span>
  );
}

export function Logo({ className, wordmarkClassName }: { className?: string; wordmarkClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={cn("whitespace-nowrap font-display text-2xl leading-none tracking-[-0.01em]", wordmarkClassName)}>
        {brand.name}
      </span>
    </span>
  );
}
