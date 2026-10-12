import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { dispatchDue } from "@/lib/notifications/dispatch";
import { siteOrigin } from "@/lib/site";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";

// Called every few minutes by a scheduler (docs/07):
//   GET /api/cron/notifications   Authorization: Bearer $CRON_SECRET
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!adminConfigured()) return NextResponse.json({ error: "SUPABASE_SECRET_KEY not set" }, { status: 503 });

  const summary = await dispatchDue(createAdminClient(), await siteOrigin());
  return NextResponse.json(summary);
}
