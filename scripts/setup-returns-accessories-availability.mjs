/**
 * One-time schema setup for returnability, digital return reports,
 * and L2 availability confirmation on catalog add.
 *
 * Safe to re-run. Usage:
 *   node scripts/setup-returns-accessories-availability.mjs
 * Reads .env.migration.local (same pattern as other setup scripts).
 */
import { config as loadEnv } from "dotenv";
import { Client, Databases, Permission, Role } from "node-appwrite";

loadEnv({ path: ".env.migration.local" });
loadEnv({ path: ".env" });

const DB = process.env.DEST_APPWRITE_DATABASE_ID || process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;
const ASSETS_ID = "68a2f5600012a7780a8a";
const REQUESTS_ID = "68a2fafb000dd6864f5e";
const ISSUES_ID = "68a2fffe003661c07e78";
const REPORTS_ID =
  process.env.NEXT_PUBLIC_ASSET_RETURN_REPORTS_COLLECTION_ID || "698f0ret01a2b3c4d5e6";

const client = new Client()
  .setEndpoint(
    process.env.DEST_APPWRITE_ENDPOINT ||
      process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ||
      "https://appwrite.nrep.ug/v1"
  )
  .setProject(
    process.env.DEST_APPWRITE_PROJECT_ID || process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID
  )
  .setKey(process.env.DEST_APPWRITE_API_KEY || process.env.APPWRITE_API_KEY);

const databases = new Databases(client);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function attrKeys(collectionId) {
  const res = await databases.listAttributes(DB, collectionId);
  return new Set(res.attributes.map((a) => a.key));
}

async function ensureString(collectionId, key, size = 255) {
  const existing = await attrKeys(collectionId);
  if (existing.has(key)) {
    console.log(`  = ${collectionId}.${key} exists`);
    return;
  }
  await databases.createStringAttribute(DB, collectionId, key, size, false);
  console.log(`  + ${collectionId}.${key} (string)`);
  await sleep(700);
}

async function ensureBool(collectionId, key) {
  const existing = await attrKeys(collectionId);
  if (existing.has(key)) {
    console.log(`  = ${collectionId}.${key} exists`);
    return;
  }
  await databases.createBooleanAttribute(DB, collectionId, key, false);
  console.log(`  + ${collectionId}.${key} (boolean)`);
  await sleep(700);
}

async function ensureDatetime(collectionId, key) {
  const existing = await attrKeys(collectionId);
  if (existing.has(key)) {
    console.log(`  = ${collectionId}.${key} exists`);
    return;
  }
  await databases.createDatetimeAttribute(DB, collectionId, key, false);
  console.log(`  + ${collectionId}.${key} (datetime)`);
  await sleep(700);
}

async function ensureStringArray(collectionId, key, size = 255) {
  const existing = await attrKeys(collectionId);
  if (existing.has(key)) {
    console.log(`  = ${collectionId}.${key} exists`);
    return;
  }
  await databases.createStringAttribute(DB, collectionId, key, size, false, undefined, true);
  console.log(`  + ${collectionId}.${key} (string[])`);
  await sleep(700);
}

async function ensureEnumElements(collectionId, key, desiredElements) {
  const res = await databases.listAttributes(DB, collectionId);
  const attr = res.attributes.find((a) => a.key === key);
  if (!attr) {
    console.log(`  ! ${collectionId}.${key} not found — skipped`);
    return;
  }
  if (attr.format !== "enum" || !Array.isArray(attr.elements)) {
    console.log(`  ! ${collectionId}.${key} is not an enum — skipped`);
    return;
  }
  const missing = desiredElements.filter((e) => !attr.elements.includes(e));
  if (missing.length === 0) {
    console.log(`  = ${collectionId}.${key} enum already complete`);
    return;
  }
  const merged = [...attr.elements];
  for (const value of missing) {
    if (!merged.includes(value)) merged.push(value);
  }
  await databases.updateEnumAttribute({
    databaseId: DB,
    collectionId,
    key,
    elements: merged,
    required: attr.required ?? false,
    xdefault: attr.default ?? null,
  });
  console.log(`  + ${collectionId}.${key} added enum values: ${missing.join(", ")}`);
  await sleep(1200);
}

const AVAILABLE_STATUS_ELEMENTS = [
  "AVAILABLE",
  "RESERVED",
  "IN_USE",
  "AWAITING_DEPLOY",
  "MAINTENANCE",
  "REPAIR_REQUIRED",
  "OUT_FOR_SERVICE",
  "AWAITING_RETURN",
  "PENDING_AVAILABILITY",
  "RETIRED",
  "DISPOSED",
];

const CURRENT_CONDITION_ELEMENTS = [
  "NEW",
  "LIKE_NEW",
  "GOOD",
  "FAIR",
  "POOR",
  "DAMAGED",
  "LOST",
  "SCRAP",
];

async function ensureReportsCollection() {
  console.log("\n[1] ASSET_RETURN_REPORTS collection...");
  try {
    await databases.getCollection(DB, REPORTS_ID);
    console.log(`  = collection ${REPORTS_ID} exists`);
  } catch {
    await databases.createCollection(
      DB,
      REPORTS_ID,
      "Asset Return Reports",
      [
        Permission.read(Role.users()),
        Permission.create(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ],
      true
    );
    console.log(`  + created collection ${REPORTS_ID}`);
    await sleep(1200);
  }

  await ensureString(REPORTS_ID, "orgId");
  await ensureString(REPORTS_ID, "assetId");
  await ensureString(REPORTS_ID, "issueId");
  await ensureString(REPORTS_ID, "requestId");
  await ensureString(REPORTS_ID, "submittedByStaffId");
  await ensureString(REPORTS_ID, "status");
  await ensureString(REPORTS_ID, "reportedCondition");
  await ensureString(REPORTS_ID, "reason", 2000);
  await ensureString(REPORTS_ID, "recommendation", 2000);
  await ensureStringArray(REPORTS_ID, "accessoriesReturned");
  await ensureStringArray(REPORTS_ID, "accessoriesMissing");
  await ensureString(REPORTS_ID, "adminConfirmedByStaffId");
  await ensureDatetime(REPORTS_ID, "adminConfirmedAt");
  await ensureString(REPORTS_ID, "adminNotes", 2000);
  await ensureString(REPORTS_ID, "assignedL2StaffId");
  await ensureString(REPORTS_ID, "l2AcknowledgedByStaffId");
  await ensureDatetime(REPORTS_ID, "l2AcknowledgedAt");
  await ensureDatetime(REPORTS_ID, "submittedAt");
}

async function setupAssets() {
  console.log("\n[2] ASSETS attributes...");
  await ensureEnumElements(ASSETS_ID, "availableStatus", AVAILABLE_STATUS_ELEMENTS);
  await ensureEnumElements(ASSETS_ID, "currentCondition", CURRENT_CONDITION_ELEMENTS);
  await ensureBool(ASSETS_ID, "canBeReturnable");
  await ensureString(ASSETS_ID, "availabilityConfirmStatus");
  await ensureString(ASSETS_ID, "assignedAvailabilityL2StaffId");
  await ensureString(ASSETS_ID, "availabilityNote", 2000);
  await ensureDatetime(ASSETS_ID, "availabilityDecidedAt");
}

async function setupRequests() {
  console.log("\n[3] ASSET_REQUESTS attributes...");
  await ensureBool(REQUESTS_ID, "isReturnable");
}

async function setupIssues() {
  console.log("\n[4] ASSET_ISSUES attributes...");
  await ensureBool(ISSUES_ID, "isReturnable");
}

if (!DB || !process.env.DEST_APPWRITE_API_KEY && !process.env.APPWRITE_API_KEY) {
  console.error("Missing database ID or API key in .env.migration.local / .env");
  process.exit(1);
}

console.log("Setting up returns / accessories / availability schema...");
await ensureReportsCollection();
await setupAssets();
await setupRequests();
await setupIssues();
console.log("\nDone. Set NEXT_PUBLIC_ASSET_RETURN_REPORTS_COLLECTION_ID=" + REPORTS_ID);
