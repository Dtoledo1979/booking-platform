// Email (Resend) and SMS (Twilio) over their REST APIs. Server-only; keys
// come from the environment and are never sent to the browser.
//   RESEND_API_KEY, EMAIL_FROM            — e.g. "Demo Studio <bookings@yourdomain.co.nz>"
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM (an NZ-capable number or sender)

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string; retryable: boolean };

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export function smsConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

// 5xx and rate limits are worth retrying; 4xx (bad address, etc.) are not.
const retryable = (status: number) => status >= 500 || status === 429;

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
  replyTo?: string | null;
  idempotencyKey: string;
}): Promise<SendResult> {
  const from = process.env.EMAIL_FROM!;
  // Show the business name as the sender while keeping the verified address.
  const address = from.match(/<(.+)>/)?.[1] ?? from;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": params.idempotencyKey,
    },
    body: JSON.stringify({
      from: params.fromName ? `${params.fromName.replace(/[<>"]/g, "")} <${address}>` : from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${body.message ?? "error"}`, retryable: retryable(res.status) };
  return { ok: true, id: body.id ?? null };
}

export async function sendSms(params: { to: string; body: string }): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: params.to, From: process.env.TWILIO_FROM!, Body: params.body }),
  });
  const body = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) return { ok: false, error: `Twilio ${res.status}: ${body.message ?? "error"}`, retryable: retryable(res.status) };
  return { ok: true, id: body.sid ?? null };
}
