/**
 * Send return-to-store reminders for due / overdue fulfilled asset requests.
 *
 * Usage:
 *   node scripts/send-return-reminders.mjs
 *   node scripts/send-return-reminders.mjs --dry-run
 *   node scripts/send-return-reminders.mjs --advance-days 1
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.migration.local" });
loadEnv({ path: ".env" });

const { runReturnReminders } = await import(
  "../lib/services/return-reminders.js"
);

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const advanceIdx = args.indexOf("--advance-days");
const advanceDays =
  advanceIdx >= 0 ? Number(args[advanceIdx + 1] || 1) : 1;

console.log(
  `\n=== Return reminders ${dryRun ? "(DRY RUN)" : "(SENDING)"} — advanceDays=${advanceDays} ===\n`
);

const result = await runReturnReminders({ dryRun, advanceDays });
console.log(JSON.stringify(result, null, 2));
console.log("\nDone.\n");
