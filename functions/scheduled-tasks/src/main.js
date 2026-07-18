/**
 * Appwrite Function / Node cron entry for return-to-store reminders.
 * Prefer: node scripts/send-return-reminders.mjs
 * Or: POST /api/cron/return-reminders with CRON_SECRET
 */
import { runReturnReminders } from "../../../lib/services/return-reminders.js";

export default async function scheduledTasks({ log = console.log, error = console.error } = {}) {
  log("Starting return reminder scheduled task...");
  try {
    const result = await runReturnReminders({ advanceDays: 1 });
    log(`Return reminders done: ${JSON.stringify(result)}`);
    return { success: true, result };
  } catch (err) {
    error("Scheduled return reminders failed:", err);
    return { success: false, error: err.message || String(err) };
  }
}

export async function appwriteFunction({ log, error }) {
  return scheduledTasks({ log, error });
}
