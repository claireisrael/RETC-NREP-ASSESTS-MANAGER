/**
 * Assign Appwrite STAFF roles by email.
 *
 * Usage:
 *   node scripts/assign-staff-roles.mjs
 *   node scripts/assign-staff-roles.mjs --email smuhumuza@nrep.ug --roles ASSET_ADMIN,CONSUMABLE_ADMIN
 *
 * Reads destination Appwrite config from .env.migration.local
 */
import { config as loadEnv } from "dotenv";
import { Client, Databases, Query } from "node-appwrite";

loadEnv({ path: ".env.migration.local" });

const args = process.argv.slice(2);
function getArg(flag, fallback = null) {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}

const email = (getArg("--email", "smuhumuza@nrep.ug") || "").toLowerCase().trim();
const rolesCsv = getArg("--roles", "ASSET_ADMIN,CONSUMABLE_ADMIN,STAFF");
const rolesToEnsure = rolesCsv
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

const DB = process.env.DEST_APPWRITE_DATABASE_ID;
const STAFF_COLLECTION_ID = process.env.DEST_STAFF_COLLECTION_ID;

const client = new Client()
  .setEndpoint(process.env.DEST_APPWRITE_ENDPOINT || "https://appwrite.nrep.ug/v1")
  .setProject(process.env.DEST_APPWRITE_PROJECT_ID)
  .setKey(process.env.DEST_APPWRITE_API_KEY);

const databases = new Databases(client);

async function main() {
  if (!DB || !STAFF_COLLECTION_ID || !process.env.DEST_APPWRITE_API_KEY) {
    console.error("Missing DEST_* config in .env.migration.local");
    process.exit(1);
  }
  if (!email) {
    console.error("Provide --email");
    process.exit(1);
  }

  console.log(`\nLooking up staff by email: ${email}`);
  const found = await databases.listDocuments(DB, STAFF_COLLECTION_ID, [
    Query.equal("email", email),
    Query.limit(5),
  ]);

  if (!found.documents.length) {
    // Case-insensitive fallback scan (Appwrite equal is case-sensitive)
    console.log("Exact match not found; scanning staff list...");
    let offset = 0;
    let match = null;
    while (!match) {
      const page = await databases.listDocuments(DB, STAFF_COLLECTION_ID, [
        Query.limit(100),
        Query.offset(offset),
      ]);
      if (!page.documents.length) break;
      match = page.documents.find(
        (d) => String(d.email || "").toLowerCase() === email
      );
      if (page.documents.length < 100) break;
      offset += 100;
    }
    if (!match) {
      console.error(`No staff document found for ${email}`);
      process.exit(1);
    }
    found.documents = [match];
  }

  for (const staff of found.documents) {
    const current = Array.isArray(staff.roles) ? staff.roles : [];
    const merged = Array.from(new Set([...current, ...rolesToEnsure]));
    console.log(`  Staff: ${staff.name} (${staff.$id})`);
    console.log(`  Current roles: [${current.join(", ") || "none"}]`);
    console.log(`  New roles:     [${merged.join(", ")}]`);

    if (merged.length === current.length && rolesToEnsure.every((r) => current.includes(r))) {
      console.log("  Already has required roles — no update needed.");
      continue;
    }

    await databases.updateDocument(DB, STAFF_COLLECTION_ID, staff.$id, {
      roles: merged,
    });
    console.log("  Updated successfully.");
  }

  console.log("\nDone. Ask the user to log out and log back in.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
