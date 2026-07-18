/**
 * One-time: add recipient-tracking attributes to the ASSET_ISSUES collection
 * so we can capture WHO an asset/consumable was issued to (and how many units).
 *
 * Safe to re-run: existing attributes are detected and skipped.
 * Usage: node scripts/setup-issue-recipients.mjs
 */
import { config as loadEnv } from "dotenv";
import { Client, Databases } from "node-appwrite";

loadEnv({ path: ".env.migration.local" });

const DB = process.env.DEST_APPWRITE_DATABASE_ID;
const ISSUES_COLLECTION_ID = "68a2fffe003661c07e78";

const client = new Client()
  .setEndpoint(process.env.DEST_APPWRITE_ENDPOINT || "https://appwrite.nrep.ug/v1")
  .setProject(process.env.DEST_APPWRITE_PROJECT_ID)
  .setKey(process.env.DEST_APPWRITE_API_KEY);

const databases = new Databases(client);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const existing = new Set(
  (await databases.listAttributes(DB, ISSUES_COLLECTION_ID)).attributes.map((a) => a.key)
);

async function ensureString(key, size = 255) {
  if (existing.has(key)) {
    console.log(`  = ${key} already exists, skipping`);
    return;
  }
  await databases.createStringAttribute(DB, ISSUES_COLLECTION_ID, key, size, false);
  console.log(`  + added string attribute: ${key}`);
  await sleep(600);
}

async function ensureInteger(key) {
  if (existing.has(key)) {
    console.log(`  = ${key} already exists, skipping`);
    return;
  }
  await databases.createIntegerAttribute(DB, ISSUES_COLLECTION_ID, key, false);
  console.log(`  + added integer attribute: ${key}`);
  await sleep(600);
}

console.log("Ensuring ASSET_ISSUES recipient attributes...");
await ensureString("requesterStaffId");
await ensureString("requesterName");
await ensureInteger("quantity");
console.log("Done.");
