/**
 * One-time setup for the two-step (L1 -> L2) approval workflow.
 *
 *  1. Adds approval-tracking attributes to the ASSET_REQUESTS collection.
 *  2. Grants the SYSTEM_ADMIN (superadmin / L2) role to the two named users.
 *
 * Safe to re-run: existing attributes / roles are detected and skipped.
 *
 * Usage: node scripts/setup-approvals.mjs
 * Reads config from .env.migration.local
 */
import { config as loadEnv } from "dotenv";
import { Client, Databases, Query } from "node-appwrite";

loadEnv({ path: ".env.migration.local" });

const DB = process.env.DEST_APPWRITE_DATABASE_ID;
const REQUESTS_COLLECTION_ID = "68a2fafb000dd6864f5e";
const STAFF_COLLECTION_ID = process.env.DEST_STAFF_COLLECTION_ID;

// Superadmins (L2). Matched by email against the staff collection.
const SUPERADMIN_EMAILS = ["mukisanic@nrep.ug", "pnduhuura@nrep.ug"];
const SYSTEM_ADMIN_ROLE = "SYSTEM_ADMIN";

const client = new Client()
  .setEndpoint(process.env.DEST_APPWRITE_ENDPOINT || "https://appwrite.nrep.ug/v1")
  .setProject(process.env.DEST_APPWRITE_PROJECT_ID)
  .setKey(process.env.DEST_APPWRITE_API_KEY);

const databases = new Databases(client);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function existingAttributeKeys() {
  const res = await databases.listAttributes(DB, REQUESTS_COLLECTION_ID);
  return new Set(res.attributes.map((a) => a.key));
}

async function addStringAttr(key, size = 255) {
  await databases.createStringAttribute(
    DB,
    REQUESTS_COLLECTION_ID,
    key,
    size,
    false // required = false (optional; existing docs stay valid)
  );
  console.log(`  + added string attribute: ${key}`);
}

async function addDatetimeAttr(key) {
  await databases.createDatetimeAttribute(
    DB,
    REQUESTS_COLLECTION_ID,
    key,
    false
  );
  console.log(`  + added datetime attribute: ${key}`);
}

async function setupSchema() {
  console.log("\n[1/2] Ensuring ASSET_REQUESTS approval attributes...");
  const existing = await existingAttributeKeys();

  const stringAttrs = [
    "approvalStage",
    "l1ApproverStaffId",
    "l2ApproverStaffId",
    "assignedL2StaffId",
  ];
  const datetimeAttrs = ["l1DecisionAt", "l2DecisionAt"];

  for (const key of stringAttrs) {
    if (existing.has(key)) {
      console.log(`  = ${key} already exists, skipping`);
      continue;
    }
    await addStringAttr(key);
    await sleep(600); // let Appwrite finish provisioning before the next
  }

  for (const key of datetimeAttrs) {
    if (existing.has(key)) {
      console.log(`  = ${key} already exists, skipping`);
      continue;
    }
    await addDatetimeAttr(key);
    await sleep(600);
  }
}

async function setupSuperadmins() {
  console.log("\n[2/2] Granting SYSTEM_ADMIN to superadmins...");
  for (const email of SUPERADMIN_EMAILS) {
    const res = await databases.listDocuments(DB, STAFF_COLLECTION_ID, [
      Query.equal("email", email),
      Query.limit(1),
    ]);
    const staff = res.documents[0];
    if (!staff) {
      console.log(`  ! no staff record found for ${email} (skipped)`);
      continue;
    }
    const roles = Array.isArray(staff.roles) ? staff.roles : [];
    if (roles.includes(SYSTEM_ADMIN_ROLE)) {
      console.log(`  = ${email} already has SYSTEM_ADMIN`);
      continue;
    }
    const newRoles = [...roles, SYSTEM_ADMIN_ROLE];
    await databases.updateDocument(DB, STAFF_COLLECTION_ID, staff.$id, {
      roles: newRoles,
    });
    console.log(`  + ${email} -> roles now [${newRoles.join(", ")}]`);
  }
}

async function main() {
  console.log("=== Two-step approval setup ===");
  await setupSchema();
  await setupSuperadmins();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("\nSetup failed:", err?.message || err);
  process.exit(1);
});
