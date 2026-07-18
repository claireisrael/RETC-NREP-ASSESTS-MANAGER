import { NextResponse } from "next/server";
import { runReturnReminders } from "../../../../lib/services/return-reminders.js";

/**
 * Cron endpoint for return-to-store reminders.
 *
 * Secure with CRON_SECRET:
 *   Authorization: Bearer <CRON_SECRET>
 *   or ?secret=<CRON_SECRET>
 *
 * Schedule daily (e.g. 08:00) via host cron / Appwrite Function / GitHub Action.
 */
async function handle(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const bearer = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const url = new URL(request.url);
    const querySecret = url.searchParams.get("secret") || "";
    const expected = process.env.CRON_SECRET || "";

    if (expected && bearer !== expected && querySecret !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const dryRun =
      !!body.dryRun || url.searchParams.get("dryRun") === "1";
    const advanceDays =
      body.advanceDays != null
        ? Number(body.advanceDays)
        : url.searchParams.get("advanceDays") != null
          ? Number(url.searchParams.get("advanceDays"))
          : 1;

    const result = await runReturnReminders({ dryRun, advanceDays });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Return reminders cron failed:", error);
    return NextResponse.json(
      { success: false, error: error.message || String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  return handle(request);
}

export async function GET(request) {
  return handle(request);
}
