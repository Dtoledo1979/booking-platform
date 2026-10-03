import { twMerge } from "tailwind-merge";

// Joins class names, skipping falsy values. Conflicting Tailwind utilities
// are resolved so the last one wins (e.g. a caller's "p-0" overrides a
// component's "p-5 sm:p-6"), regardless of their order in the CSS.
export function cn(...classes: Array<string | false | null | undefined>) {
  return twMerge(classes.filter(Boolean).join(" "));
}
