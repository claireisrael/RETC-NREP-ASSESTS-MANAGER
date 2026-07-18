/**
 * Return-to-store reminder / overdue notifications.
 *
 * Finds fulfilled (issued) asset requests whose expectedReturnDate has arrived
 * or passed, emails the requester to bring items back to the store, and stamps
 * reminder timestamps on the request so we do not spam.
 *
 * Intended to be run daily via:
 *   - node scripts/send-return-reminders.mjs
 *   - POST /api/cron/return-reminders (with CRON_SECRET)
 */

import { Client, Databases, Query } from "node-appwrite";
import { COLLECTIONS, ENUMS } from "../appwrite/config.js";
import { NodemailerService } from "./nodemailer.js";
import { renderEmailTemplate } from "./email-templates.js";
import { resolveEmailBranding } from "../utils/email-branding.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a, b) {
  return Math.floor((startOfDay(a) - startOfDay(b)) / MS_PER_DAY);
}

function createDatabasesClient() {
  const endpoint =
    process.env.DEST_APPWRITE_ENDPOINT ||
    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ||
    "https://appwrite.nrep.ug/v1";
  const projectId =
    process.env.DEST_APPWRITE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
  const apiKey =
    process.env.DEST_APPWRITE_API_KEY ||
    process.env.APPWRITE_API_KEY ||
    process.env.NEXT_PUBLIC_APPWRITE_API_KEY;
  const databaseId =
    process.env.DEST_APPWRITE_DATABASE_ID ||
    process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;

  if (!projectId || !apiKey || !databaseId) {
    throw new Error(
      "Missing Appwrite config. Set DEST_APPWRITE_* (or APPWRITE_API_KEY + NEXT_PUBLIC_*)"
    );
  }

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

  return { databases: new Databases(client), databaseId };
}

async function listAllDocuments(databases, databaseId, collectionId, queries) {
  const documents = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const page = await databases.listDocuments(databaseId, collectionId, [
      ...queries,
      Query.limit(limit),
      Query.offset(offset),
    ]);
    documents.push(...(page.documents || []));
    if (!page.documents?.length || page.documents.length < limit) break;
    offset += limit;
  }
  return documents;
}

async function resolveItemsSummary(databases, databaseId, request) {
  const ids = Array.isArray(request.requestedItems)
    ? request.requestedItems
    : [];
  if (ids.length === 0) {
    return { summary: "Borrowed item(s)", assetCount: 1, consumableCount: 0 };
  }

  const names = [];
  let assetCount = 0;
  let consumableCount = 0;

  for (const id of ids.slice(0, 20)) {
    try {
      const item = await databases.getDocument(
        databaseId,
        COLLECTIONS.ASSETS,
        id
      );
      if (item.itemType === ENUMS.ITEM_TYPE.CONSUMABLE) {
        consumableCount += 1;
      } else {
        assetCount += 1;
      }
      names.push(item.name || item.assetTag || id);
    } catch {
      assetCount += 1;
      names.push(id);
    }
  }

  return {
    summary: names.join(", "),
    assetCount,
    consumableCount,
  };
}

async function sendTemplatedEmail(type, recipient, data, branding) {
  const rendered = renderEmailTemplate(type, data, branding);
  return NodemailerService.sendNotification(type, recipient, data, rendered);
}

/**
 * Run the return reminder job.
 * @param {{ dryRun?: boolean, advanceDays?: number }} options
 */
export async function runReturnReminders(options = {}) {
  const dryRun = !!options.dryRun;
  // Remind this many days before due date (0 = on the due day / overdue)
  const advanceDays =
    options.advanceDays != null ? Number(options.advanceDays) : 1;

  const { databases, databaseId } = createDatabasesClient();
  const today = startOfDay(new Date());
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + advanceDays);
  windowEnd.setHours(23, 59, 59, 999);

  // Issued loans that are due soon or already overdue.
  const requests = await listAllDocuments(
    databases,
    databaseId,
    COLLECTIONS.ASSET_REQUESTS,
    [
      Query.equal("status", ENUMS.REQUEST_STATUS.FULFILLED),
      Query.lessThanEqual("expectedReturnDate", windowEnd.toISOString()),
      Query.orderAsc("expectedReturnDate"),
    ]
  );

  const summary = {
    scanned: requests.length,
    reminded: 0,
    overdue: 0,
    skipped: 0,
    errors: [],
  };

  for (const request of requests) {
    try {
      if (!request.expectedReturnDate || !request.requesterStaffId) {
        summary.skipped += 1;
        continue;
      }

      const due = startOfDay(new Date(request.expectedReturnDate));
      const daysUntilDue = daysBetween(due, today); // negative => overdue
      const daysOverdue = daysUntilDue < 0 ? Math.abs(daysUntilDue) : 0;

      const { summary: itemsSummary, assetCount } = await resolveItemsSummary(
        databases,
        databaseId,
        request
      );

      // Consumable-only fulfilments do not need a physical return to the store.
      if (assetCount === 0) {
        summary.skipped += 1;
        continue;
      }

      let requester;
      try {
        requester = await databases.getDocument(
          databaseId,
          COLLECTIONS.STAFF,
          request.requesterStaffId
        );
      } catch {
        summary.errors.push({
          requestId: request.$id,
          error: "Requester staff not found",
        });
        continue;
      }

      if (!requester?.email) {
        summary.skipped += 1;
        continue;
      }

      const branding = resolveEmailBranding({
        request,
        requester,
        orgId: request.orgId || requester.orgId,
        orgCode: request.orgCode || requester.orgCode,
      });

      const payload = {
        requesterName: requester.name || "Colleague",
        assetName: itemsSummary,
        itemsSummary,
        requestId: request.$id,
        expectedReturnDate: request.expectedReturnDate,
        daysUntilDue: Math.max(daysUntilDue, 0),
        daysOverdue,
        orgId: request.orgId || requester.orgId,
      };

      if (daysUntilDue < 0) {
        // Overdue: send on day 1, then every 3 days.
        const lastSent = request.overdueNoticeLastSentAt
          ? startOfDay(new Date(request.overdueNoticeLastSentAt))
          : null;
        const shouldSend =
          !lastSent || daysBetween(today, lastSent) >= 3;

        if (!shouldSend) {
          summary.skipped += 1;
          continue;
        }

        if (!dryRun) {
          await sendTemplatedEmail(
            "RETURN_OVERDUE",
            requester.email,
            payload,
            branding
          );
          try {
            await databases.updateDocument(
              databaseId,
              COLLECTIONS.ASSET_REQUESTS,
              request.$id,
              { overdueNoticeLastSentAt: new Date().toISOString() }
            );
          } catch (attrErr) {
            console.warn(
              "Could not stamp overdueNoticeLastSentAt (attribute may be missing):",
              attrErr.message
            );
          }
        }
        summary.overdue += 1;
      } else {
        // Due today or within advanceDays window.
        if (request.returnReminderSentAt) {
          summary.skipped += 1;
          continue;
        }

        if (!dryRun) {
          await sendTemplatedEmail(
            "RETURN_REMINDER",
            requester.email,
            payload,
            branding
          );
          try {
            await databases.updateDocument(
              databaseId,
              COLLECTIONS.ASSET_REQUESTS,
              request.$id,
              { returnReminderSentAt: new Date().toISOString() }
            );
          } catch (attrErr) {
            console.warn(
              "Could not stamp returnReminderSentAt (attribute may be missing):",
              attrErr.message
            );
          }
        }
        summary.reminded += 1;
      }
    } catch (error) {
      summary.errors.push({
        requestId: request.$id,
        error: error.message || String(error),
      });
    }
  }

  return summary;
}
