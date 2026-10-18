import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runPoll } from "@/lib/poll";

// Called every 10 minutes by cron-job.org with "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    // HotDoc being unreachable is reported in the body with a 200, so the cron service keeps calling
    // (it disables jobs that fail repeatedly). The owner is emailed about outages separately.
    return NextResponse.json(await runPoll());
  } catch (err) {
    console.error("poll failed", err);
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
