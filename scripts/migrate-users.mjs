/**
 * User migration script.
 *
 * Reads users (name + email) from a SOURCE Appwrite project and creates matching
 * accounts in this system's DESTINATION Appwrite project:
 *   1. Creates an Appwrite Auth user with a first-time temporary password.
 *   2. Creates a staff document in the destination database.
 *
 * SECURITY:
 *   - All secrets are read from environment variables. Never hardcode API keys.
 *   - Put values in a local, git-ignored file (e.g. .env.migration.local) and load them,
 *     or export them in your shell before running.
 *
 * USAGE (PowerShell example):
 *   # dry run (default - writes nothing):
 *   node scripts/migrate-users.mjs
 *
 *   # actually create users + staff docs:
 *   node scripts/migrate-users.mjs --commit
 *
 * REQUIRED ENV VARS:
 *   SOURCE_APPWRITE_PROJECT_ID   Source project id to read users from
 *   SOURCE_APPWRITE_API_KEY      Source API key (needs users.read)
 *   DEST_APPWRITE_PROJECT_ID     Destination project id (this system)
 *   DEST_APPWRITE_API_KEY        Destination API key (needs users.write + databases.write)
 *   DEST_APPWRITE_DATABASE_ID    Destination database id
 *   DEST_STAFF_COLLECTION_ID     Destination staff collection id
 *   MIGRATION_ORG_ID             orgId to stamp on each imported staff record
 *
 * OPTIONAL ENV VARS:
 *   SOURCE_APPWRITE_ENDPOINT     default: https://appwrite.nrep.ug/v1
 *   DEST_APPWRITE_ENDPOINT       default: https://appwrite.nrep.ug/v1
 *   MIGRATION_DEFAULT_ROLE       default: STAFF
 *   MIGRATION_SHARED_PASSWORD    if set, uses this password for everyone instead of random
 *   MIGRATION_CSV_PATH           default: scripts/migrated-credentials.csv
 */

import { writeFileSync, appendFileSync, existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";
import { Client, Users, Databases, ID, Query } from "node-appwrite";

// Load migration secrets from a local, git-ignored file if present.
loadEnv({ path: ".env.migration.local" });

const COMMIT = process.argv.includes("--commit");

const DEFAULTS = {
  SOURCE_APPWRITE_ENDPOINT: "https://appwrite.nrep.ug/v1",
  DEST_APPWRITE_ENDPOINT: "https://appwrite.nrep.ug/v1",
  MIGRATION_DEFAULT_ROLE: "STAFF",
  MIGRATION_CSV_PATH: "scripts/migrated-credentials.csv",
};

function env(name, { required = false, fallback } = {}) {
  const val = process.env[name] ?? fallback;
  if (required && (!val || String(val).trim() === "")) {
    console.error(`\n[config error] Missing required env var: ${name}`);
    process.exit(1);
  }
  return val;
}

const config = {
  source: {
    endpoint: env("SOURCE_APPWRITE_ENDPOINT", {
      fallback: DEFAULTS.SOURCE_APPWRITE_ENDPOINT,
    }),
    projectId: env("SOURCE_APPWRITE_PROJECT_ID", { required: true }),
    apiKey: env("SOURCE_APPWRITE_API_KEY", { required: true }),
  },
  dest: {
    endpoint: env("DEST_APPWRITE_ENDPOINT", {
      fallback: DEFAULTS.DEST_APPWRITE_ENDPOINT,
    }),
    projectId: env("DEST_APPWRITE_PROJECT_ID", { required: true }),
    apiKey: env("DEST_APPWRITE_API_KEY", { required: true }),
    databaseId: env("DEST_APPWRITE_DATABASE_ID", { required: true }),
    staffCollectionId: env("DEST_STAFF_COLLECTION_ID", { required: true }),
  },
  orgId: env("MIGRATION_ORG_ID", { required: true }),
  defaultRole: env("MIGRATION_DEFAULT_ROLE", {
    fallback: DEFAULTS.MIGRATION_DEFAULT_ROLE,
  }),
  sharedPassword: env("MIGRATION_SHARED_PASSWORD"),
  csvPath: env("MIGRATION_CSV_PATH", { fallback: DEFAULTS.MIGRATION_CSV_PATH }),
};

function makeClient({ endpoint, projectId, apiKey }) {
  return new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);
}

function generatePassword() {
  if (config.sharedPassword) return config.sharedPassword;
  // 12+ chars, mixed classes, satisfies Appwrite's 8-char minimum comfortably.
  const rand = () => Math.random().toString(36).slice(-6);
  return `Temp${rand()}${rand().toUpperCase()}!9`;
}

async function listAllSourceUsers(users) {
  const all = [];
  const pageSize = 100;
  let offset = 0;
  // Paginate through every user in the source project.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await users.list([
      Query.limit(pageSize),
      Query.offset(offset),
    ]);
    const batch = res.users || [];
    all.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function destUserByEmail(users, email) {
  try {
    const res = await users.list([Query.equal("email", email)]);
    return (res.users || [])[0] || null;
  } catch {
    return null;
  }
}

async function destStaffExists(databases, email) {
  try {
    const res = await databases.listDocuments(
      config.dest.databaseId,
      config.dest.staffCollectionId,
      [Query.equal("email", email), Query.limit(1)]
    );
    return (res.documents || []).length > 0;
  } catch {
    return false;
  }
}

async function createStaffDoc(databases, { userId, name, email }) {
  // NOTE: this STAFF collection has no orgId attribute, so we must not send it.
  return databases.createDocument(
    config.dest.databaseId,
    config.dest.staffCollectionId,
    ID.unique(),
    {
      userId,
      name,
      email,
      roles: [config.defaultRole],
      active: true,
    }
  );
}

function initCsv() {
  if (!existsSync(config.csvPath)) {
    writeFileSync(config.csvPath, "name,email,userId,temporaryPassword\n");
  }
}

function appendCsv(row) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  appendFileSync(
    config.csvPath,
    [row.name, row.email, row.userId, row.temporaryPassword].map(esc).join(",") +
      "\n"
  );
}

async function main() {
  console.log(
    `\n=== User migration ${COMMIT ? "(COMMIT MODE - will write)" : "(DRY RUN - no writes)"} ===`
  );
  console.log(`Source project : ${config.source.projectId} @ ${config.source.endpoint}`);
  console.log(`Dest project   : ${config.dest.projectId} @ ${config.dest.endpoint}`);
  console.log(`Dest database  : ${config.dest.databaseId}`);
  console.log(`Staff coll.    : ${config.dest.staffCollectionId}`);
  console.log(`Org id         : ${config.orgId}`);
  console.log(`Default role   : ${config.defaultRole}\n`);

  const sourceUsers = new Users(makeClient(config.source));
  const destUsersSvc = new Users(makeClient(config.dest));
  const destDb = new Databases(makeClient(config.dest));

  console.log("Reading users from source...");
  const users = await listAllSourceUsers(sourceUsers);
  console.log(`Found ${users.length} users in source project.\n`);

  if (COMMIT) initCsv();

  const stats = { created: 0, skipped: 0, failed: 0 };

  for (const u of users) {
    const email = (u.email || "").toLowerCase().trim();
    const name = (u.name || "").trim() || email;

    if (!email) {
      console.log(`- SKIP (no email): ${u.$id}`);
      stats.skipped++;
      continue;
    }

    // Inspect destination state for this email.
    const existingAuthUser = await destUserByEmail(destUsersSvc, email);
    const staffExists = await destStaffExists(destDb, email);

    // Fully migrated already -> nothing to do.
    if (existingAuthUser && staffExists) {
      console.log(`- SKIP (already fully migrated): ${email}`);
      stats.skipped++;
      continue;
    }

    const password = generatePassword();

    if (!COMMIT) {
      if (existingAuthUser && !staffExists) {
        console.log(`- WOULD RECOVER (auth exists, staff missing): ${email}`);
      } else {
        console.log(`- WOULD CREATE: ${email} (${name})`);
      }
      stats.created++;
      continue;
    }

    try {
      let authUser = existingAuthUser;

      if (authUser) {
        // Orphaned auth user from a previous partial run: reset password so we
        // can capture a known first-time password in the CSV.
        await destUsersSvc.updatePassword(authUser.$id, password);
      } else {
        authUser = await destUsersSvc.create(
          ID.unique(),
          email,
          undefined,
          password,
          name
        );
      }

      if (!staffExists) {
        // IMPORTANT: link the staff doc to the Auth user via its real $id.
        // Login resolves staff with getByUserId(authUser.$id); a mismatch here
        // causes "no_staff_record" on sign-in.
        await createStaffDoc(destDb, { userId: authUser.$id, name, email });
      }

      appendCsv({ name, email, userId: authUser.$id, temporaryPassword: password });
      console.log(
        `- ${existingAuthUser ? "RECOVERED" : "CREATED"}: ${email} (auth ${authUser.$id})`
      );
      stats.created++;
    } catch (err) {
      console.error(`- FAILED: ${email} -> ${err?.message || err}`);
      stats.failed++;
    }
  }

  console.log(
    `\nDone. Created: ${stats.created}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`
  );
  if (COMMIT) {
    console.log(`Credentials written to: ${config.csvPath}`);
  } else {
    console.log(`\nThis was a DRY RUN. Re-run with --commit to actually create users.`);
  }
}

main().catch((err) => {
  console.error("\nMigration crashed:", err?.message || err);
  process.exit(1);
});
