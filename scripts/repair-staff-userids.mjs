/**
 * Repair migrated staff records whose `userId` does not match their Appwrite
 * Auth user `$id`. This is what causes "no_staff_record" at login: the app
 * resolves staff via getByUserId(authUser.$id), but the migration stored a
 * generated id instead of the real Auth $id.
 *
 * Strategy: for every Auth user in the destination project, find the staff doc
 * with the same email and, if its userId differs, update it to the Auth $id.
 *
 * Safe to re-run: records already linked correctly are skipped.
 *
 * USAGE (PowerShell):
 *   node scripts/repair-staff-userids.mjs            # dry run (no writes)
 *   node scripts/repair-staff-userids.mjs --commit   # apply fixes
 *
 * REQUIRED ENV (from .env.migration.local):
 *   DEST_APPWRITE_PROJECT_ID, DEST_APPWRITE_API_KEY,
 *   DEST_APPWRITE_DATABASE_ID, DEST_STAFF_COLLECTION_ID
 * OPTIONAL:
 *   DEST_APPWRITE_ENDPOINT (default https://appwrite.nrep.ug/v1)
 */
import { config as loadEnv } from "dotenv";
import { Client, Users, Databases, Query } from "node-appwrite";

loadEnv({ path: ".env.migration.local" });

const COMMIT = process.argv.includes("--commit");

const ENDPOINT = process.env.DEST_APPWRITE_ENDPOINT || "https://appwrite.nrep.ug/v1";
const PROJECT = process.env.DEST_APPWRITE_PROJECT_ID;
const API_KEY = process.env.DEST_APPWRITE_API_KEY;
const DB = process.env.DEST_APPWRITE_DATABASE_ID;
const STAFF = process.env.DEST_STAFF_COLLECTION_ID;

for (const [k, v] of Object.entries({
  DEST_APPWRITE_PROJECT_ID: PROJECT,
  DEST_APPWRITE_API_KEY: API_KEY,
  DEST_APPWRITE_DATABASE_ID: DB,
  DEST_STAFF_COLLECTION_ID: STAFF,
})) {
  if (!v) {
    console.error(`[config error] Missing required env var: ${k}`);
    process.exit(1);
  }
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(API_KEY);
const users = new Users(client);
const databases = new Databases(client);

async function listAllAuthUsers() {
  const all = [];
  const pageSize = 100;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await users.list([Query.limit(pageSize), Query.offset(offset)]);
    const batch = res.users || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function staffByEmail(email) {
  const res = await databases.listDocuments(DB, STAFF, [
    Query.equal("email", email),
    Query.limit(1),
  ]);
  return (res.documents || [])[0] || null;
}

async function main() {
  console.log(
    `\n=== Repair staff userIds ${COMMIT ? "(COMMIT - will write)" : "(DRY RUN)"} ===`
  );
  const authUsers = await listAllAuthUsers();
  console.log(`Found ${authUsers.length} auth users.\n`);

  const stats = { fixed: 0, ok: 0, noStaff: 0, failed: 0 };

  for (const u of authUsers) {
    const email = (u.email || "").toLowerCase().trim();
    if (!email) continue;

    const staff = await staffByEmail(email);
    if (!staff) {
      console.log(`- NO STAFF DOC: ${email} (auth ${u.$id})`);
      stats.noStaff++;
      continue;
    }

    if (staff.userId === u.$id) {
      stats.ok++;
      continue;
    }

    if (!COMMIT) {
      console.log(`- WOULD FIX: ${email}  ${staff.userId || "(empty)"} -> ${u.$id}`);
      stats.fixed++;
      continue;
    }

    try {
      await databases.updateDocument(DB, STAFF, staff.$id, { userId: u.$id });
      console.log(`- FIXED: ${email}  -> ${u.$id}`);
      stats.fixed++;
    } catch (err) {
      console.error(`- FAILED: ${email} -> ${err?.message || err}`);
      stats.failed++;
    }
  }

  console.log(
    `\nDone. Fixed: ${stats.fixed}, Already OK: ${stats.ok}, No staff doc: ${stats.noStaff}, Failed: ${stats.failed}`
  );
  if (!COMMIT) console.log("\nDRY RUN. Re-run with --commit to apply.");
}

main().catch((err) => {
  console.error("\nRepair crashed:", err?.message || err);
  process.exit(1);
});
