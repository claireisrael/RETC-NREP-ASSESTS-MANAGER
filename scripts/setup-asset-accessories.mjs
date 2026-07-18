/**
 * One-time: add accessory attributes.
 *  - ASSETS.accessories            -> string[] (e.g. "Charger", "Remote", "HDMI cable")
 *  - ASSET_REQUESTS.requestedAccessories -> string[] (accessories a requester attached)
 *
 * Safe to re-run: existing attributes are detected and skipped.
 * Usage: node scripts/setup-asset-accessories.mjs
 */
import { config as loadEnv } from "dotenv";
import { Client, Databases } from "node-appwrite";

loadEnv({ path: ".env.migration.local" });

const DB = process.env.DEST_APPWRITE_DATABASE_ID;
const ASSETS_COLLECTION_ID = "68a2f5600012a7780a8a";
const REQUESTS_COLLECTION_ID = "68a2fafb000dd6864f5e";

const client = new Client()
  .setEndpoint(process.env.DEST_APPWRITE_ENDPOINT || "https://appwrite.nrep.ug/v1")
  .setProject(process.env.DEST_APPWRITE_PROJECT_ID)
  .setKey(process.env.DEST_APPWRITE_API_KEY);

const databases = new Databases(client);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureStringArray(collectionId, key, size = 255) {
  const existing = new Set(
    (await databases.listAttributes(DB, collectionId)).attributes.map((a) => a.key)
  );
  if (existing.has(key)) {
    console.log(`  = ${collectionId}.${key} already exists, skipping`);
    return;
  }
  // createStringAttribute(db, collection, key, size, required, default, array)
  await databases.createStringAttribute(DB, collectionId, key, size, false, undefined, true);
  console.log(`  + added string[] attribute: ${collectionId}.${key}`);
  await sleep(800);
}

console.log("Ensuring accessory attributes...");
await ensureStringArray(ASSETS_COLLECTION_ID, "accessories");
await ensureStringArray(REQUESTS_COLLECTION_ID, "requestedAccessories");
console.log("Done.");
