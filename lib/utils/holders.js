import {
  assetIssuesService,
  assetRequestsService,
  staffService,
} from "../appwrite/provider.js";
import { ENUMS } from "../appwrite/config.js";
import { Query } from "appwrite";

// An asset is "held" when it is not freely available.
export function isAssetHeld(asset) {
  if (!asset) return false;
  return asset.availableStatus !== ENUMS.AVAILABLE_STATUS.AVAILABLE;
}

/**
 * Resolve the NAME of the person currently holding an asset.
 * Primary source is the latest issue record's captured recipient name; falls
 * back to resolving the recipient/custodian id only if no name was captured.
 * Returns null when the asset is available.
 */
export async function getAssetHolderName(asset) {
  if (!isAssetHeld(asset)) return null;
  try {
    const res = await assetIssuesService.list([
      Query.equal("assetId", asset.$id),
      Query.orderDesc("issuedAt"),
    ]);
    const latest = res?.documents?.[0];

    if (latest?.requesterName) return latest.requesterName;

    const fallbackId = latest?.requesterStaffId || asset.custodianStaffId;
    if (fallbackId) {
      const staff = await staffService.get(fallbackId).catch(() => null);
      if (staff?.name) return staff.name;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve recent recipients of a consumable from its issue records.
 * Each issue record captures who received it (requesterStaffId) and how many.
 * Falls back to the linked request's requester for older records.
 *
 * @returns {Promise<Array<{name: string, quantity: number, issuedAt: string}>>}
 */
export async function getConsumableRecipients(consumableId, { limit = 10 } = {}) {
  if (!consumableId) return [];
  try {
    const res = await assetIssuesService.list([
      Query.equal("assetId", consumableId),
      Query.orderDesc("issuedAt"),
    ]);
    const issues = (res?.documents || []).slice(0, 50);

    const staffCache = new Map();
    const nameFor = async (staffId) => {
      if (!staffId) return null;
      if (staffCache.has(staffId)) return staffCache.get(staffId);
      const staff = await staffService.get(staffId).catch(() => null);
      const name = staff?.name || null;
      staffCache.set(staffId, name);
      return name;
    };

    const recipients = [];
    for (const issue of issues) {
      // Prefer the name captured on the issue record itself.
      let name = issue.requesterName || null;
      if (!name) {
        let staffId = issue.requesterStaffId || null;
        if (!staffId && issue.requestId) {
          const req = await assetRequestsService
            .get(issue.requestId)
            .catch(() => null);
          staffId = req?.requesterStaffId || null;
        }
        name = await nameFor(staffId);
      }
      recipients.push({
        name: name || "Unknown",
        quantity: issue.quantity || 1,
        issuedAt: issue.issuedAt,
      });
      if (recipients.length >= limit) break;
    }
    return recipients;
  } catch {
    return [];
  }
}

/**
 * Build a Map<assetId, issueRow[]> from a preloaded list of issue documents.
 * Rows are kept in the order provided (pass issues ordered by issuedAt desc for
 * "most recent first"). Used by list views to avoid per-row queries.
 */
export function buildRecipientsMap(issues = []) {
  const map = new Map();
  for (const issue of issues) {
    if (!issue?.assetId) continue;
    const arr = map.get(issue.assetId) || [];
    arr.push({
      staffId: issue.requesterStaffId || null,
      name: issue.requesterName || null,
      requestId: issue.requestId || null,
      quantity: issue.quantity || 1,
      issuedAt: issue.issuedAt,
    });
    map.set(issue.assetId, arr);
  }
  return map;
}
