/**
 * One-off: print the attributes of the STAFF collection so we know exactly
 * which fields exist (e.g. orgId, orgCode, orgCodes, orgMemberships).
 *
 * Usage: node scripts/inspect-staff-collection.mjs
 * Reads config from .env.migration.local
 */
import { config as loadEnv } from "dotenv";
import { Client, Databases } from "node-appwrite";

loadEnv({ path: ".env.migration.local" });

const client = new Client()
  .setEndpoint(process.env.DEST_APPWRITE_ENDPOINT || "https://appwrite.nrep.ug/v1")
  .setProject(process.env.DEST_APPWRITE_PROJECT_ID)
  .setKey(process.env.DEST_APPWRITE_API_KEY);

const databases = new Databases(client);

const res = await databases.listAttributes(
  process.env.DEST_APPWRITE_DATABASE_ID,
  process.env.DEST_STAFF_COLLECTION_ID
);

console.log(`\nSTAFF collection has ${res.total} attributes:\n`);
for (const a of res.attributes) {
  const extra = [
    a.required ? "required" : "optional",
    a.array ? "array" : null,
    a.type,
  ]
    .filter(Boolean)
    .join(", ");
  console.log(`  - ${a.key} (${extra})`);
}
console.log("");
