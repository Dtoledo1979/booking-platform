import type { z } from "zod";

// Shape returned by server actions used with useActionState.
export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  // Submitted values, echoed back so React 19's automatic form reset
  // doesn't wipe what the user typed when validation fails.
  values?: Record<string, string>;
};

const SECRET_FIELDS = new Set(["password"]);

export function echoValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION") && !SECRET_FIELDS.has(key)) values[key] = value;
  }
  return values;
}

export const idle: FormState = { status: "idle" };

export function fieldErrorsOf(error: z.ZodError, formData?: FormData): FormState {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return {
    status: "error",
    message: "Please check the highlighted fields.",
    fieldErrors,
    values: formData ? echoValues(formData) : undefined,
  };
}

type PostgrestLikeError = { code?: string; message?: string } | null | undefined;

// Turns database errors into messages a business owner can act on. Raw
// Postgres text is never shown to users.
export function friendlyDbError(error: PostgrestLikeError): string {
  const code = error?.code;
  const message = error?.message ?? "";
  if (code === "23505" && message.includes("slug")) return "That booking link is already taken. Try another.";
  if (code === "23514" && message.includes("slug")) return "That booking link isn't available. Try another.";
  if (code === "22023" && message.includes("timezone")) return "Please choose a valid time zone.";
  if (code === "42501") return "You don't have permission to do that.";
  if (code === "23P01") return "That time overlaps with something already in the calendar.";
  return "Something went wrong. Please try again.";
}
