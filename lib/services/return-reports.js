import { Query, ID } from "appwrite";
import { databases } from "../appwrite/client.js";
import {
  APPWRITE_CONFIG,
  COLLECTIONS,
  ENUMS,
} from "../appwrite/config.js";
import { getCurrentOrgId } from "../utils/org.js";

function stripEmpty(data) {
  const next = { ...data };
  Object.keys(next).forEach((key) => {
    if (next[key] === undefined || next[key] === null) delete next[key];
  });
  return next;
}

function withOrg(data = {}) {
  const orgId = data.orgId || getCurrentOrgId();
  return stripEmpty({ ...data, ...(orgId ? { orgId } : {}) });
}

/**
 * Catalog item is requestable when availability was confirmed (or legacy with no gate).
 */
export function isCatalogAvailabilityReady(item) {
  if (!item) return false;
  const status = item.availabilityConfirmStatus;
  const isConsumable = item.itemType === ENUMS.ITEM_TYPE.CONSUMABLE;

  const baseOk = isConsumable
    ? item.status !== ENUMS.CONSUMABLE_STATUS.DISCONTINUED &&
      item.status !== ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK
    : item.availableStatus === ENUMS.AVAILABLE_STATUS.AVAILABLE;

  if (!status || status === ENUMS.AVAILABILITY_CONFIRM_STATUS.NONE) {
    return baseOk;
  }
  if (status === ENUMS.AVAILABILITY_CONFIRM_STATUS.CONFIRMED) {
    return baseOk;
  }
  return false;
}

export function needsReturnExceptionL2(condition) {
  return (
    condition === ENUMS.RETURN_REPORT_CONDITION.POOR ||
    condition === ENUMS.RETURN_REPORT_CONDITION.LOST ||
    condition === ENUMS.CURRENT_CONDITION.POOR ||
    condition === ENUMS.CURRENT_CONDITION.LOST ||
    condition === ENUMS.CURRENT_CONDITION.DAMAGED
  );
}

export function mapReportConditionToDelta(condition) {
  switch (condition) {
    case ENUMS.RETURN_REPORT_CONDITION.GOOD:
      return ENUMS.RETURN_DELTA.GOOD;
    case ENUMS.RETURN_REPORT_CONDITION.FAIR:
      return ENUMS.RETURN_DELTA.FAIR;
    case ENUMS.RETURN_REPORT_CONDITION.POOR:
      return ENUMS.RETURN_DELTA.POOR;
    case ENUMS.RETURN_REPORT_CONDITION.LOST:
      return ENUMS.RETURN_DELTA.LOST;
    default:
      return ENUMS.RETURN_DELTA.OK;
  }
}

/**
 * Appwrite ASSET_RETURNS.delta enum is legacy: GOOD | OK | DAMAGED only.
 * Map richer app values before writing documents (logic still uses postCondition).
 */
export function toAppwriteReturnDelta(delta, postCondition) {
  if (
    postCondition === ENUMS.CURRENT_CONDITION.LOST ||
    delta === ENUMS.RETURN_DELTA.LOST
  ) {
    return ENUMS.RETURN_DELTA.DAMAGED;
  }
  switch (delta) {
    case ENUMS.RETURN_DELTA.GOOD:
      return ENUMS.RETURN_DELTA.GOOD;
    case ENUMS.RETURN_DELTA.OK:
    case ENUMS.RETURN_DELTA.FAIR:
      return ENUMS.RETURN_DELTA.OK;
    case ENUMS.RETURN_DELTA.DAMAGED:
    case ENUMS.RETURN_DELTA.POOR:
      return ENUMS.RETURN_DELTA.DAMAGED;
    default:
      return ENUMS.RETURN_DELTA.OK;
  }
}

/** postCondition stored on ASSET_RETURNS — map LOST to DAMAGED if schema is legacy. */
export function toAppwriteReturnPostCondition(postCondition) {
  const value = postCondition || ENUMS.CURRENT_CONDITION.GOOD;
  if (value === ENUMS.CURRENT_CONDITION.LOST) {
    return ENUMS.CURRENT_CONDITION.DAMAGED;
  }
  if (value === ENUMS.CURRENT_CONDITION.POOR) {
    return ENUMS.CURRENT_CONDITION.DAMAGED;
  }
  if (value === ENUMS.CURRENT_CONDITION.FAIR) {
    return ENUMS.CURRENT_CONDITION.GOOD;
  }
  return value;
}

/** Map report condition to asset currentCondition / postCondition. */
export function mapReportConditionToPostCondition(condition) {
  switch (condition) {
    case ENUMS.RETURN_REPORT_CONDITION.GOOD:
      return ENUMS.CURRENT_CONDITION.GOOD;
    case ENUMS.RETURN_REPORT_CONDITION.FAIR:
      return ENUMS.CURRENT_CONDITION.FAIR;
    case ENUMS.RETURN_REPORT_CONDITION.POOR:
      return ENUMS.CURRENT_CONDITION.POOR;
    case ENUMS.RETURN_REPORT_CONDITION.LOST:
      return ENUMS.CURRENT_CONDITION.LOST;
    default:
      return ENUMS.CURRENT_CONDITION.GOOD;
  }
}

/**
 * Whether an issued line should expect a physical return.
 * Assets always return; consumables only when marked returnable on the request.
 */
export function resolveIssueReturnable(request, item) {
  if (!item) return Boolean(request?.isReturnable);
  if (item.itemType !== ENUMS.ITEM_TYPE.CONSUMABLE) return true;

  const name = String(item.name || "").trim().toLowerCase();
  const lines = [
    ...(Array.isArray(request?.requestedAccessories)
      ? request.requestedAccessories
      : []),
    ...(String(request?.purpose || "").split("\n")),
  ];
  if (name) {
    const explicitlyNon = lines.some((line) => {
      const l = String(line || "").toLowerCase();
      return l.includes("non-returnable") && l.includes(name);
    });
    if (explicitlyNon) return false;

    const marked = lines.some((line) => {
      const l = String(line || "").toLowerCase();
      return (
        l.includes("returnable") &&
        !l.includes("non-returnable") &&
        l.includes(name)
      );
    });
    if (marked) return true;
  }
  return Boolean(request?.isReturnable);
}

export const returnReportsService = {
  async list(queries = []) {
    return databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_RETURN_REPORTS,
      queries
    );
  },

  async get(id) {
    return databases.getDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_RETURN_REPORTS,
      id
    );
  },

  async listPendingAdmin() {
    return this.list([
      Query.equal("status", ENUMS.RETURN_REPORT_STATUS.SUBMITTED),
      Query.orderDesc("$createdAt"),
      Query.limit(200),
    ]);
  },

  async listAwaitingL2(staffId) {
    const queries = [
      Query.equal("status", ENUMS.RETURN_REPORT_STATUS.AWAITING_L2),
      Query.orderDesc("$createdAt"),
      Query.limit(200),
    ];
    if (staffId) queries.unshift(Query.equal("assignedL2StaffId", staffId));
    return this.list(queries);
  },

  async create(data) {
    const payload = withOrg({
      ...data,
      status: data.status || ENUMS.RETURN_REPORT_STATUS.SUBMITTED,
      submittedAt: data.submittedAt || new Date().toISOString(),
      accessoriesReturned: Array.isArray(data.accessoriesReturned)
        ? data.accessoriesReturned
        : [],
      accessoriesMissing: Array.isArray(data.accessoriesMissing)
        ? data.accessoriesMissing
        : [],
    });
    return databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_RETURN_REPORTS,
      ID.unique(),
      payload
    );
  },

  async update(id, data) {
    return databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_RETURN_REPORTS,
      id,
      stripEmpty(data)
    );
  },

  async listSubmittedForIssue(issueId) {
    if (!issueId) return [];
    const result = await this.list([
      Query.equal("issueId", issueId),
      Query.limit(20),
    ]);
    return (result.documents || []).filter(
      (r) =>
        r.status === ENUMS.RETURN_REPORT_STATUS.SUBMITTED ||
        r.status === ENUMS.RETURN_REPORT_STATUS.AWAITING_L2 ||
        r.status === ENUMS.RETURN_REPORT_STATUS.ADMIN_CONFIRMED
    );
  },

  async hasActiveReport(issueId) {
    const open = await this.listSubmittedForIssue(issueId);
    return open.length > 0;
  },
};
