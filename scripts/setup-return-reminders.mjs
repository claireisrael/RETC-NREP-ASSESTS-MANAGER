/**
 * Add return-reminder tracking attributes on ASSET_REQUESTS.
 * Safe to re-run.
 *
 * Usage: node scripts/setup-return-reminders.mjs
 */
import { config as loadEnv } from "dotenv";
import { Client, Databases } from "node-appwrite";

loadEnv({ path: ".env.migration.local" });
loadEnv({ path: ".env" });

const DB = process.env.DEST_APPWRITE_DATABASE_ID || process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
const REQUESTS = "68a2fafb000dd6864f5e";

const client = new Client()
  .setEndpoint(
    process.env.DEST_APPWRITE_ENDPOINT ||
      process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ||
      "https://appwrite.nrep.ug/v1"
  )
  .setProject(
    process.env.DEST_APPWRITE_PROJECT_ID ||
      process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
  )
  .setKey(process.env.DEST_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureDatetime(key) {
  const existing = await databases.listAttributes(DB, REQUESTS);
  if (existing.attributes.some((a) => a.key === key)) {
    console.log(`  ✓ ${key} already exists`);
    return;
  }
  console.log(`  + creating ${key}`);
  await databases.createDatetimeAttribute(DB, REQUESTS, key, false);
  await sleep(1500);
}

async function main() {
  if (!DB || !(process.env.DEST_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY)) {
    console.error("Missing Appwrite database id / API key");
    process.exit(1);
  }

  console.log("\nSetting up return-reminder attributes on ASSET_REQUESTS...");
  await ensureDatetime("returnReminderSentAt");
  await ensureDatetime("overdueNoticeLastSentAt");
  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
