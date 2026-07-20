"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { account, databases, storage } from "./client.js";
import { APPWRITE_CONFIG, COLLECTIONS, ENUMS } from "./config.js";
import { Query, ID } from "appwrite";
import { EmailService } from "../services/email.js";
import { getCurrentOrgId, getCurrentOrgIdAsync } from "../utils/org.js";
import { returnReportsService, toAppwriteReturnDelta, toAppwriteReturnPostCondition } from "../services/return-reports.js";

/** Resolve orgId: sync first, then async API fallback (e.g. when env not available at build time). */
async function getResolvedOrgId() {
  const id = getCurrentOrgId();
  if (id && typeof id === "string" && id.trim() !== "") return id.trim();
  const asyncId = await getCurrentOrgIdAsync();
  if (asyncId && typeof asyncId === "string" && asyncId.trim() !== "") return asyncId.trim();
  return null;
}

// Ensure we only pass valid query strings to Appwrite (prevents 400 from malformed URLs)
function sanitizeQueries(queries) {
  if (!Array.isArray(queries)) return [];
  return queries.filter((q) => typeof q === "string" && q.length > 0);
}

const buildOrgQueries = (queries = []) => {
  const orgId = getCurrentOrgId();
  if (!orgId || typeof orgId !== "string" || orgId.trim() === "") return sanitizeQueries(queries);
  return [Query.equal("orgId", String(orgId).trim()), ...sanitizeQueries(queries)];
};

const buildOrgQueriesFromId = (orgId, queries = []) => {
  const id = orgId != null && typeof orgId === "string" ? String(orgId).trim() : "";
  if (!id) return sanitizeQueries(queries);
  return [Query.equal("orgId", id), ...sanitizeQueries(queries)];
};

// List documents WITHOUT sending orgId in query (avoids 400 from appwrite.nrep.ug); filter by org client-side.
async function listWithoutOrgFilter(collectionId, queries, maxLimit = 2000) {
  const orgId = await getResolvedOrgId();
  const safeQueries = sanitizeQueries(queries);
  const hasLimit = safeQueries.some((q) => typeof q === "string" && q.startsWith("limit("));
  const listQueries = hasLimit ? safeQueries : [Query.limit(maxLimit), ...safeQueries];
  let result;
  try {
    result = await databases.listDocuments(
      APPWRITE_CONFIG.databaseId,
      collectionId,
      listQueries
    );
  } catch (err) {
    console.error("listWithoutOrgFilter failed", collectionId, err?.message || err);
    throw err;
  }
  if (!orgId || typeof orgId !== "string" || orgId.trim() === "") return result;
  const orgIdNorm = String(orgId).trim();
  // Include: matching orgId, or legacy docs with no orgId (so saved assets always show)
  const filtered = (result.documents || []).filter((d) => {
    const docOrg = d.orgId;
    if (docOrg === null || docOrg === undefined || docOrg === "") return true;
    return String(docOrg).trim() === orgIdNorm;
  });
  return { ...result, documents: filtered, total: filtered.length };
}

const ensureOrgId = (data = {}) => {
  const orgId = data.orgId || getCurrentOrgId();
  return orgId ? { ...data, orgId } : { ...data };
};

const isMissingOrgAttributeError = (error) =>
  error?.message &&
  typeof error.message === "string" &&
  error.message.includes("Attribute not found in schema: orgId");

const isConflictError = (error) =>
  error?.code === 409 ||
  error?.type === "document_already_exists" ||
  error?.response?.code === 409 ||
  (typeof error?.message === "string" && error.message.includes("already exists"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWithRetry(operation, { retries = 2, delay = 250 } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const isNetworkError =
        error?.message === "Failed to fetch" ||
        error?.code === "network_error" ||
        error?.type === "network_error";

      const shouldRetry = isNetworkError && attempt < retries;

      if (!shouldRetry) {
        throw error;
      }

      const backoff = delay * (attempt + 1);
      await sleep(backoff);
    }
  }

  throw lastError;
}

function sanitizeEventValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return value.length > 100 ? value.slice(0, 100) : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    const stringValue = String(value);
    return stringValue.length > 100 ? stringValue.slice(0, 100) : stringValue;
  }

  try {
    const stringValue = JSON.stringify(value);
    return stringValue.length > 100 ? stringValue.slice(0, 100) : stringValue;
  } catch (error) {
    const fallback = String(value);
    return fallback.length > 100 ? fallback.slice(0, 100) : fallback;
  }
}

// Per-call counter so every event ID is unique even in the same millisecond
let eventIdCounter = 0;

// Generate a globally unique ID for event documents (max 36 chars: a-z, 0-9, hyphen).
// Use crypto.randomUUID() when available so 409 cannot happen; fallback keeps counter + random.
function uniqueEventId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  eventIdCounter += 1;
  const t = Date.now().toString(36);
  const r = (typeof crypto !== "undefined" && crypto.getRandomValues
    ? Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map((n) => n.toString(36)).join("")
    : Math.random().toString(36).slice(2, 6)
  );
  return `evt_${t}_${eventIdCounter}_${r}`.slice(0, 36);
}

// Helper function to write asset events (immutable audit trail).
// Never throws: event write is best-effort so asset create/update always succeeds.
export async function writeAssetEvent(
  assetId,
  eventType,
  fromValue = null,
  toValue = null,
  actorStaffId,
  notes = null
) {
  // Safely resolve orgId for event. If we cannot determine it, skip writing the event
  // rather than throwing a schema error for missing required attribute.
  const resolvedOrgId = getCurrentOrgId();
  if (!resolvedOrgId) {
    console.warn(
      "Skipping asset event because orgId could not be determined",
      { assetId, eventType }
    );
    return null;
  }

  const eventData = {
    assetId,
    eventType,
    fromValue: sanitizeEventValue(fromValue),
    toValue: sanitizeEventValue(toValue),
    actorStaffId,
    at: new Date().toISOString(),
    notes,
    orgId: resolvedOrgId,
  };

  try {
    return await databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_EVENTS,
      ID.unique(),
      eventData
    );
  } catch (error) {
    // Never throw: event is optional; asset create/update must always succeed
    if (isConflictError(error)) {
      console.warn("Asset event conflict (duplicate ID), skipping event");
    } else {
      console.warn("Asset event write failed, skipping event", error?.message || error);
    }
    return null;
  }
}

// Helper function to parse JSON fields safely
function parseJsonField(field) {
  if (typeof field === "string") {
    try {
      return JSON.parse(field);
    } catch (error) {
      console.warn("Failed to parse JSON field:", field, error);
      return field;
    }
  }
  return field;
}

// Helper function to stringify JSON fields for storage
function stringifyJsonField(field) {
  if (typeof field === "object" && field !== null) {
    try {
      return JSON.stringify(field);
    } catch (error) {
      console.warn("Failed to stringify JSON field:", field, error);
      return field;
    }
  }
  return field;
}

// Settings operations (singleton collection)
export const settingsService = {
  async get() {
    try {
      const result = await databases.listDocuments(
        APPWRITE_CONFIG.databaseId,
        COLLECTIONS.SETTINGS
      );
      const settings = result.documents[0];

      if (!settings) return null;

      // Parse JSON fields that are stored as strings in Appwrite
      return {
        ...settings,
        branding: parseJsonField(settings.branding),
        approval: {
          ...parseJsonField(settings.approval || "{}"),
          thresholds: parseJsonField(
            settings.approval?.thresholds || settings.thresholds
          ),
        },
        reminders: {
          ...parseJsonField(settings.reminders || "{}"),
          overdueDays: parseJsonField(
            settings.reminders?.overdueDays || settings.overdueDays
          ),
        },
        smtpSettings: parseJsonField(settings.smtpSettings),
      };
    } catch (error) {
      return null;
    }
  },

  async create(data) {
    // Stringify JSON fields before storing
    const preparedData = {
      ...data,
      branding: stringifyJsonField(data.branding),
      approval: stringifyJsonField(data.approval),
      reminders: stringifyJsonField(data.reminders),
      smtpSettings: stringifyJsonField(data.smtpSettings),
    };

    return await databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.SETTINGS,
      "unique()",
      preparedData
    );
  },

  async update(documentId, data) {
    // Stringify JSON fields before storing
    const preparedData = {
      ...data,
      branding: data.branding ? stringifyJsonField(data.branding) : undefined,
      approval: data.approval ? stringifyJsonField(data.approval) : undefined,
      reminders: data.reminders
        ? stringifyJsonField(data.reminders)
        : undefined,
      smtpSettings: data.smtpSettings
        ? stringifyJsonField(data.smtpSettings)
        : undefined,
    };

    // Remove undefined fields
    Object.keys(preparedData).forEach((key) => {
      if (preparedData[key] === undefined) {
        delete preparedData[key];
      }
    });

    return await databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.SETTINGS,
      documentId,
      preparedData
    );
  },
};

// Departments operations (no org in query to avoid 400)
export const departmentsService = {
  async list(queries = []) {
    return listWithoutOrgFilter(COLLECTIONS.DEPARTMENTS, queries, 500);
  },

  async get(id) {
    return await databases.getDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.DEPARTMENTS,
      id
    );
  },

  async create(data) {
    return await databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.DEPARTMENTS,
      ID.unique(),
      ensureOrgId(data)
    );
  },

  async update(id, data) {
    return await databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.DEPARTMENTS,
      id,
      data
    );
  },

  async delete(id) {
    return await databases.deleteDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.DEPARTMENTS,
      id
    );
  },
};

export const projectsService = {
  async list(queries = []) {
    return listWithoutOrgFilter(COLLECTIONS.PROJECTS, queries, 500);
  },
};

// Staff operations (no org in query to avoid 400)
export const staffService = {
  async list(queries = []) {
    return listWithoutOrgFilter(COLLECTIONS.STAFF, queries, 2000);
  },

  async listForSelection() {
    const result = await listWithoutOrgFilter(COLLECTIONS.STAFF, [Query.orderAsc("name")], 2000);
    return (result.documents || []).map((staff) => ({
      $id: staff.$id,
      name: staff.name,
      email: staff.email,
      department: staff.department,
    }));
  },

  async get(id) {
    return await databases.getDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.STAFF,
      id
    );
  },

  async getByUserId(userId) {
    const result = await listWithoutOrgFilter(
      COLLECTIONS.STAFF,
      [Query.equal("userId", userId)],
      500
    );
    return (result.documents && result.documents[0]) || null;
  },

  async create(data) {
    return await databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.STAFF,
      "unique()",
      ensureOrgId(data)
    );
  },

  async update(id, data) {
    return await databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.STAFF,
      id,
      ensureOrgId(data)
    );
  },

  async delete(id) {
    return await databases.deleteDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.STAFF,
      id
    );
  },
};

// Assets operations (no org in query to avoid 400)
export const assetsService = {
  async list(queries = []) {
    return listWithoutOrgFilter(COLLECTIONS.ASSETS, queries, 2000);
  },

  async get(id) {
    const asset = await databases.getDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSETS,
      id
    );

    // Return asset directly (Appwrite handles arrays natively)
    return asset;
  },

  async getByAssetTag(assetTag) {
    const result = await listWithoutOrgFilter(
      COLLECTIONS.ASSETS,
      [Query.equal("assetTag", assetTag)],
      500
    );
    return (result.documents && result.documents[0]) || null;
  },

  async getByStaff(staffId) {
    return listWithoutOrgFilter(COLLECTIONS.ASSETS, [
      Query.equal("custodianStaffId", staffId),
      Query.orderDesc("$createdAt"),
    ], 500);
  },

  async create(data, actorStaffId) {
    const preparedData = ensureOrgId({
      ...data,
      attachmentFileIds: data.attachmentFileIds || [],
    });

    // Remove null and undefined values to avoid schema validation errors
    Object.keys(preparedData).forEach((key) => {
      if (preparedData[key] === undefined || preparedData[key] === null) {
        delete preparedData[key];
      }
    });

    // Handle projectId based on organization
    // RETC has no projects: Appwrite still requires the attribute, so we send a placeholder.
    // NREP requires a valid projectId from the Projects collection.
    const retcOrgId = process.env.NEXT_PUBLIC_RETC_ORG_ID;
    const isRetcOrg = preparedData.orgId && retcOrgId && preparedData.orgId.toString() === retcOrgId.toString();
    const emptyProjectId =
      !preparedData.projectId ||
      preparedData.projectId === "" ||
      (typeof preparedData.projectId === "string" && preparedData.projectId.trim() === "");

    if (isRetcOrg) {
      // RETC: no projects. Send placeholder so Appwrite "required" is satisfied; we never delete.
      if (emptyProjectId || preparedData.projectId === "RETC_NO_PROJECT") {
        preparedData.projectId = "RETC_NO_PROJECT";
      }
    } else {
      // NREP or other orgs: remove only if empty/invalid
      if (emptyProjectId) {
        delete preparedData.projectId;
      }
    }

    if (preparedData.assetTag) {
      const tagQueries = [Query.equal("assetTag", preparedData.assetTag)];
      if (preparedData.orgId) {
        tagQueries.push(Query.equal("orgId", preparedData.orgId));
      }

      const conflictError = new Error(
        "An asset with this tag already exists for this organisation."
      );
      conflictError.code = "asset_tag_conflict";

      try {
        const existing = await databases.listDocuments(
          APPWRITE_CONFIG.databaseId,
          COLLECTIONS.ASSETS,
          tagQueries
        );

        if (existing.total > 0) {
          throw conflictError;
        }
      } catch (checkError) {
        if (checkError.code === "asset_tag_conflict") {
          throw checkError;
        }

        if (isMissingOrgAttributeError(checkError)) {
          const legacyExisting = await databases.listDocuments(
            APPWRITE_CONFIG.databaseId,
            COLLECTIONS.ASSETS,
            [Query.equal("assetTag", preparedData.assetTag)]
          );

          if (legacyExisting.total > 0) {
            throw conflictError;
          }
        } else {
          throw checkError;
        }
      }
    }

    const item = await databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSETS,
      ID.unique(),
      preparedData
    );

    // Fire-and-forget creation event (ID.unique() in writeAssetEvent avoids 409)
    if (actorStaffId) {
      const label = preparedData.itemType === ENUMS.ITEM_TYPE.CONSUMABLE ? "Consumable created" : "Asset created";
      writeAssetEvent(
        item.$id,
        ENUMS.EVENT_TYPE.CREATED,
        null,
        preparedData.itemType === ENUMS.ITEM_TYPE.CONSUMABLE ? preparedData.status : preparedData.availableStatus,
        actorStaffId,
        label
      ).catch(() => {});
    }

    return item;
  },

  async update(id, data, actorStaffId, notes = null, options = {}) {
    const oldAsset = await this.get(id);

    // Always ensure orgId is present:
    // - Use existing orgId from the document when available
    // - Fallback to current org (cookie/env) for legacy documents that lack orgId
    const preparedData = ensureOrgId({
      ...data,
      orgId: oldAsset.orgId,
      attachmentFileIds:
        data.attachmentFileIds !== undefined
          ? data.attachmentFileIds
          : undefined,
    });

    // Remove undefined and null fields
    Object.keys(preparedData).forEach((key) => {
      if (preparedData[key] === undefined || preparedData[key] === null) {
        delete preparedData[key];
      }
    });

    // Handle projectId (same as create: RETC uses placeholder so required attribute is satisfied)
    const retcOrgIdUpdate = process.env.NEXT_PUBLIC_RETC_ORG_ID;
    const isRetcOrgUpdate = preparedData.orgId && retcOrgIdUpdate && preparedData.orgId.toString() === retcOrgIdUpdate.toString();
    const emptyProjectIdUpdate =
      !preparedData.projectId ||
      preparedData.projectId === "" ||
      (typeof preparedData.projectId === "string" && preparedData.projectId.trim() === "");

    if (isRetcOrgUpdate) {
      if (emptyProjectIdUpdate || preparedData.projectId === "RETC_NO_PROJECT") {
        preparedData.projectId = "RETC_NO_PROJECT";
      }
    } else {
      if (emptyProjectIdUpdate) {
        delete preparedData.projectId;
      }
    }

    const updatedAsset = await databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSETS,
      id,
      preparedData
    );

    // Get actor staff details for notifications
    const actorStaff = actorStaffId
      ? await staffService.get(actorStaffId).catch(() => null)
      : null;

    // Write appropriate events based on what changed
    if (oldAsset.availableStatus !== data.availableStatus) {
      try {
        await writeAssetEvent(
          id,
          ENUMS.EVENT_TYPE.STATUS_CHANGED,
          oldAsset.availableStatus,
          data.availableStatus,
          actorStaffId,
          notes
        );
      } catch (eventError) {
        if (!isConflictError(eventError)) {
          console.warn("Failed to write asset status change event", eventError);
        }
      }
    }

    if (oldAsset.currentCondition !== data.currentCondition) {
      try {
        await writeAssetEvent(
          id,
          ENUMS.EVENT_TYPE.CONDITION_CHANGED,
          oldAsset.currentCondition,
          data.currentCondition,
          actorStaffId,
          notes
        );
      } catch (eventError) {
        if (!isConflictError(eventError)) {
          console.warn("Failed to write asset condition change event", eventError);
        }
      }
    }

    // Check for custodian assignment change and send notification
    if (
      oldAsset.custodianStaffId !== data.custodianStaffId &&
      data.custodianStaffId
    ) {
      try {
        const newCustodian = await staffService.get(data.custodianStaffId);
        if (
          newCustodian &&
          newCustodian.email &&
          options.sendNotification !== false
        ) {
          await EmailService.sendAssetAssigned(
            updatedAsset,
            newCustodian,
            actorStaff,
            notes
          );
        }
      } catch (error) {
        console.warn("Failed to send asset assignment notification:", error);
      }
    }

    // Check for maintenance due date and send notification if approaching
    if (data.nextMaintenanceDue && options.checkMaintenanceDue !== false) {
      const maintenanceDueDate = new Date(data.nextMaintenanceDue);
      const now = new Date();
      const daysUntilMaintenance = Math.ceil(
        (maintenanceDueDate - now) / (1000 * 60 * 60 * 24)
      );

      // Send notification if maintenance is due within 7 days
      if (daysUntilMaintenance <= 7 && daysUntilMaintenance >= 0) {
        try {
          const custodian = data.custodianStaffId
            ? await staffService.get(data.custodianStaffId).catch(() => null)
            : null;
          if (options.sendNotification !== false) {
            await EmailService.sendMaintenanceDue(updatedAsset, custodian);
          }
        } catch (error) {
          console.warn("Failed to send maintenance due notification:", error);
        }
      }
    }

    return updatedAsset;
  },

  async delete(id) {
    return await databases.deleteDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSETS,
      id
    );
  },

  // Get public projection for guest portal (no org in query to avoid 400)
  async getPublicAssets(queries = []) {
    const result = await listWithoutOrgFilter(
      COLLECTIONS.ASSETS,
      [Query.equal("isPublic", true), ...sanitizeQueries(queries)],
      2000
    );
    return {
      ...result,
      documents: (result.documents || []).map((asset) => ({
        $id: asset.$id,
        name: asset.name,
        category: asset.category,
        publicSummary: asset.publicSummary,
        availableStatus: asset.availableStatus,
        publicConditionLabel: asset.publicConditionLabel,
        publicLocationLabel: asset.publicLocationLabel,
        publicImages: asset.publicImages || "",
        assetImage: asset.assetImage,
        locationName: asset.locationName,
        roomOrArea: asset.roomOrArea,
      })),
    };
  },

  // ================================
  // Unified Item Management (Assets + Consumables)
  // ================================

  // Get items by type (assets or consumables)
  async getByItemType(itemType, queries = []) {
    const typeQueries = [Query.equal("itemType", itemType), ...queries];
    return await this.list(typeQueries);
  },

  // Get all assets
  async getAssets(queries = []) {
    return await this.getByItemType(ENUMS.ITEM_TYPE.ASSET, queries);
  },

  // Get all consumables
  async getConsumables(queries = []) {
    return await this.getByItemType(ENUMS.ITEM_TYPE.CONSUMABLE, queries);
  },

  // Get public consumables (no org in query to avoid 400)
  async getPublicConsumables(queries = []) {
    const result = await listWithoutOrgFilter(
      COLLECTIONS.ASSETS,
      [Query.equal("itemType", ENUMS.ITEM_TYPE.CONSUMABLE), ...sanitizeQueries(queries)],
      2000
    );
    return {
      ...result,
      documents: (result.documents || []).map((consumable) => ({
        $id: consumable.$id,
        name: consumable.name,
        category: consumable.category,
        publicSummary: consumable.publicSummary,
        status: consumable.status,
        currentStock: consumable.currentStock,
        unit: consumable.unit,
        publicImages: consumable.publicImages || "",
        consumableImage: consumable.consumableImage,
        locationName: consumable.locationName,
        roomOrArea: consumable.roomOrArea,
        isPublic: consumable.isPublic,
      })),
    };
  },

  // Calculate consumable status based on stock
  calculateConsumableStatus(currentStock, minStock) {
    if (currentStock <= 0) return ENUMS.CONSUMABLE_STATUS.OUT_OF_STOCK;
    if (currentStock <= minStock) return ENUMS.CONSUMABLE_STATUS.LOW_STOCK;
    return ENUMS.CONSUMABLE_STATUS.IN_STOCK;
  },

  async confirmAvailability(id, { decidedByStaffId, note = "" } = {}) {
    const item = await this.get(id);
    const patch = {
      availabilityConfirmStatus: ENUMS.AVAILABILITY_CONFIRM_STATUS.CONFIRMED,
      availabilityDecidedAt: new Date().toISOString(),
      availabilityNote: note || "",
    };
    if (item.itemType === ENUMS.ITEM_TYPE.ASSET) {
      patch.availableStatus = ENUMS.AVAILABLE_STATUS.AVAILABLE;
    }
    return this.update(id, patch, decidedByStaffId, note || "Availability confirmed by L2");
  },

  async rejectAvailability(id, { decidedByStaffId, note = "" } = {}) {
    const item = await this.get(id);
    const patch = {
      availabilityConfirmStatus: ENUMS.AVAILABILITY_CONFIRM_STATUS.REJECTED,
      availabilityDecidedAt: new Date().toISOString(),
      availabilityNote: note || "",
    };
    if (item.itemType === ENUMS.ITEM_TYPE.ASSET) {
      patch.availableStatus = ENUMS.AVAILABLE_STATUS.PENDING_AVAILABILITY;
    }
    return this.update(id, patch, decidedByStaffId, note || "Availability rejected by L2");
  },

  async listPendingAvailability(assignedL2StaffId = null) {
    const queries = [
      Query.equal(
        "availabilityConfirmStatus",
        ENUMS.AVAILABILITY_CONFIRM_STATUS.PENDING
      ),
      Query.orderDesc("$createdAt"),
    ];
    if (assignedL2StaffId) {
      queries.unshift(
        Query.equal("assignedAvailabilityL2StaffId", assignedL2StaffId)
      );
    }
    return this.list(queries);
  },

  // Adjust consumable stock
  async adjustConsumableStock(id, adjustment, actorStaffId, notes = null) {
    const consumable = await this.get(id);

    if (consumable.itemType !== ENUMS.ITEM_TYPE.CONSUMABLE) {
      throw new Error("Item is not a consumable");
    }

    // Get current stock from proper field (with fallback to old encoded format)
    let currentStock = 0;
    if (consumable.currentStock !== undefined) {
      currentStock = consumable.currentStock;
    } else if (consumable.serialNumber && consumable.serialNumber.startsWith("STOCK:")) {
      currentStock = parseInt(consumable.serialNumber.replace("STOCK:", "")) || 0;
    }

    // Get min stock from proper field (with fallback to old encoded format)
    let minStock = 0;
    if (consumable.minimumStock !== undefined) {
      minStock = consumable.minimumStock;
    } else if (consumable.model && consumable.model.startsWith("MIN:")) {
      minStock = parseInt(consumable.model.replace("MIN:", "")) || 0;
    }

    const newStock = currentStock + adjustment;
    if (newStock < 0) {
      throw new Error("Stock cannot be negative");
    }

    const newStatus = this.calculateConsumableStatus(newStock, minStock);

    // Update using proper database fields
    const updateData = {
      currentStock: newStock,
      status: newStatus,
    };

    const result = await this.update(
      id,
      updateData,
      actorStaffId,
      notes || `Stock adjusted by ${adjustment > 0 ? "+" : ""}${adjustment}`
    );

    if (actorStaffId) {
      const eventType = "Consumable stock adjusted";

      try {
        await writeAssetEvent(
          id,
          ENUMS.EVENT_TYPE.STOCK_ADJUSTED,
          consumable.currentStock,
          newStock,
          actorStaffId,
          eventType
        );
      } catch (eventError) {
        if (!isConflictError(eventError)) {
          console.warn("Failed to write consumable adjustment event", eventError);
        }
      }
    }

    return result;
  },
};

// Asset Requests operations with email notifications
export const assetRequestsService = {
  async list(queries = []) {
    return listWithoutOrgFilter(COLLECTIONS.ASSET_REQUESTS, queries, 2000);
  },

  async get(id) {
    return await databases.getDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_REQUESTS,
      id
    );
  },

  async getByStaff(staffId) {
    const result = await listWithoutOrgFilter(
      COLLECTIONS.ASSET_REQUESTS,
      [
        Query.equal("requesterStaffId", staffId),
        Query.orderDesc("$createdAt"),
      ],
      500
    );
    return result;
  },

  async create(data, options = {}) {
    // New requests always start at first-level approval (L1).
    const payload = ensureOrgId({
      ...data,
      approvalStage: data.approvalStage || ENUMS.APPROVAL_STAGE.L1,
    });
    const request = await databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_REQUESTS,
      ID.unique(),
      payload
    );

    // Notifications are handled by callers via lib/services/approval-notifications
    // (so recipients resolve from Appwrite roles). options is kept for compatibility.
    return request;
  },

  async update(id, data, options = {}) {
    const oldRequest = await this.get(id);

    const payload = ensureOrgId({
      requesterStaffId: oldRequest.requesterStaffId,
      purpose: data.purpose ?? oldRequest.purpose,
      issueDate: data.issueDate ?? oldRequest.issueDate,
      expectedReturnDate: data.expectedReturnDate ?? oldRequest.expectedReturnDate,
      requestedItems: data.requestedItems ?? oldRequest.requestedItems,
      requestedAccessories: data.requestedAccessories ?? oldRequest.requestedAccessories,
      status: data.status ?? oldRequest.status,
      approvalStage: data.approvalStage ?? oldRequest.approvalStage,
      l1ApproverStaffId: data.l1ApproverStaffId ?? oldRequest.l1ApproverStaffId,
      l1DecisionAt: data.l1DecisionAt ?? oldRequest.l1DecisionAt,
      l2ApproverStaffId: data.l2ApproverStaffId ?? oldRequest.l2ApproverStaffId,
      l2DecisionAt: data.l2DecisionAt ?? oldRequest.l2DecisionAt,
      assignedL2StaffId:
        data.assignedL2StaffId !== undefined
          ? data.assignedL2StaffId
          : oldRequest.assignedL2StaffId,
      decisionNotes: data.decisionNotes ?? oldRequest.decisionNotes,
      decisionByStaffId: data.decisionByStaffId ?? oldRequest.decisionByStaffId,
      returnReminderSentAt:
        data.returnReminderSentAt ?? oldRequest.returnReminderSentAt,
      overdueNoticeLastSentAt:
        data.overdueNoticeLastSentAt ?? oldRequest.overdueNoticeLastSentAt,
      orgId: oldRequest.orgId,
    });
    const updatedRequest = await databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_REQUESTS,
      id,
      payload
    );

    // Send notifications based on status changes
    if (
      options.sendNotification !== false &&
      oldRequest.status !== data.status
    ) {
      try {
        switch (data.status) {
          case ENUMS.REQUEST_STATUS.APPROVED:
            if (options.requester && options.asset && options.approver) {
              await EmailService.sendRequestApproved(
                updatedRequest,
                options.requester,
                options.asset,
                options.approver
              );
            }
            break;
          case ENUMS.REQUEST_STATUS.DENIED:
            if (options.requester && options.asset && options.approver) {
              await EmailService.sendRequestDenied(
                updatedRequest,
                options.requester,
                options.asset,
                options.approver
              );
            }
            break;
          case ENUMS.REQUEST_STATUS.FULFILLED:
            if (options.requester && options.asset && options.issuer) {
              await EmailService.sendAssetIssued(
                updatedRequest,
                options.requester,
                options.asset,
                options.issuer
              );
            }
            break;
        }
      } catch (error) {
        console.warn("Failed to send status update notification:", error);
      }
    }

    return updatedRequest;
  },

  async delete(id) {
    return await databases.deleteDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_REQUESTS,
      id
    );
  },
};

// Asset Issues operations (no org in query to avoid 400)
export const assetIssuesService = {
  async list(queries = []) {
    return listWithoutOrgFilter(COLLECTIONS.ASSET_ISSUES, queries, 2000);
  },

  async get(id) {
    return await databases.getDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_ISSUES,
      id
    );
  },

  async create(data) {
    const payload = ensureOrgId(data);
    return await databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_ISSUES,
      ID.unique(),
      payload
    );
  },

  async update(id, data) {
    const existing = await this.get(id);
    const payload = {
      ...data,
      orgId: existing.orgId,
    };
    return await databases.updateDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_ISSUES,
      id,
      payload
    );
  },

  /** Open issues for a custodian/requester (no return record yet). */
  async listOpenForRequester(staffId) {
    const result = await this.list([
      Query.equal("requesterStaffId", staffId),
      Query.orderDesc("issuedAt"),
    ]);
    const open = [];
    for (const issue of result.documents || []) {
      const returns = await assetReturnsService.list([
        Query.equal("issueId", issue.$id),
      ]);
      if ((returns.documents || []).length === 0) {
        open.push(issue);
      }
    }
    return open;
  },

  /**
   * Open issues the holder is expected to return (assets + returnable consumables).
   * Excludes non-returnable consumable issues and those with an active return report.
   */
  async listOpenReturnableForRequester(staffId) {
    const open = await this.listOpenForRequester(staffId);
    const returnable = [];
    for (const issue of open) {
      if (issue.isReturnable === false) continue;

      let expectReturn = issue.isReturnable === true;
      if (!expectReturn) {
        try {
          const item = await assetsService.get(issue.assetId);
          if (item.itemType !== ENUMS.ITEM_TYPE.CONSUMABLE) {
            expectReturn = true;
          } else if (issue.dueAt) {
            expectReturn = true;
          }
        } catch {
          continue;
        }
      }
      if (!expectReturn) continue;

      const hasReport = await returnReportsService.hasActiveReport(issue.$id);
      if (hasReport) continue;
      returnable.push(issue);
    }
    return returnable;
  },
};

// Asset Returns operations (no org in query to avoid 400)
export const assetReturnsService = {
  async list(queries = []) {
    return listWithoutOrgFilter(COLLECTIONS.ASSET_RETURNS, queries, 2000);
  },

  async get(id) {
    return await databases.getDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_RETURNS,
      id
    );
  },

  async create(data, options = {}) {
    const payload = ensureOrgId(data);
    const returnRecord = await databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_RETURNS,
      ID.unique(),
      payload
    );

    // Send email notification about asset return if enabled
    if (
      options.sendNotification !== false &&
      options.request &&
      options.requester &&
      options.asset
    ) {
      try {
        await EmailService.sendAssetReturned(
          options.request,
          options.requester,
          options.asset,
          data.returnCondition || data.postCondition
        );
      } catch (error) {
        console.warn("Failed to send asset return notification:", error);
      }
    }

    return returnRecord;
  },

  /** Latest issue for an item that has no return record yet. */
  async findOpenIssue(assetId) {
    const issuesResult = await assetIssuesService.list([
      Query.equal("assetId", assetId),
      Query.orderDesc("issuedAt"),
    ]);
    for (const issue of issuesResult.documents || []) {
      const returnsResult = await this.list([Query.equal("issueId", issue.$id)]);
      if (!(returnsResult.documents || []).length) {
        return issue;
      }
    }
    return null;
  },

  /**
   * Admin/superadmin: receive a returned asset or returnable consumable.
   * Creates a return record (when an open issue exists), restores availability/stock,
   * and writes a RETURNED event.
   */
  async processReturn({
    assetId,
    issueId = null,
    receivedByStaffId,
    postCondition,
    remarks = "",
    missingAccessories = "",
    delta = ENUMS.RETURN_DELTA.GOOD,
  }) {
    if (!assetId || !receivedByStaffId) {
      throw new Error("Asset and receiving staff are required to process a return");
    }

    const asset = await assetsService.get(assetId);
    let issue = null;
    if (issueId) {
      issue = await assetIssuesService.get(issueId);
    } else {
      issue = await this.findOpenIssue(assetId);
    }

    let returnRecord = null;
    if (issue) {
      const missing =
        Array.isArray(missingAccessories)
          ? missingAccessories.filter(Boolean).join(", ")
          : String(missingAccessories || "");

      const resolvedPostCondition =
        postCondition || issue.preCondition || ENUMS.CURRENT_CONDITION.GOOD;

      returnRecord = await this.create(
        {
          issueId: issue.$id,
          returnedByStaffId: issue.requesterStaffId || "",
          receivedByStaffId,
          returnedAt: new Date().toISOString(),
          postCondition: toAppwriteReturnPostCondition(resolvedPostCondition),
          missingAccessories: missing,
          remarks: remarks || "",
          delta: toAppwriteReturnDelta(
            delta || ENUMS.RETURN_DELTA.GOOD,
            resolvedPostCondition
          ),
        },
        { sendNotification: false }
      );
    }

    const isConsumable = asset.itemType === ENUMS.ITEM_TYPE.CONSUMABLE;
    const isLost =
      postCondition === ENUMS.CURRENT_CONDITION.LOST ||
      delta === ENUMS.RETURN_DELTA.LOST;
    let updatedItem = asset;

    if (isLost) {
      if (!isConsumable) {
        updatedItem = await assetsService.update(
          assetId,
          {
            availableStatus: ENUMS.AVAILABLE_STATUS.DISPOSED,
            custodianStaffId: "",
            currentCondition: ENUMS.CURRENT_CONDITION.LOST,
          },
          receivedByStaffId,
          remarks || "Item reported lost — not returned to available stock"
        );
      } else {
        // Consumable qty was already deducted on issue; do not restock.
        updatedItem = asset;
      }
    } else if (isConsumable) {
      const qty = Math.max(1, Number(issue?.quantity) || 1);
      updatedItem = await assetsService.adjustConsumableStock(
        assetId,
        qty,
        receivedByStaffId,
        remarks ||
          `Returnable consumable received back${
            issue ? ` (issue #${issue.$id.slice(-8)})` : ""
          }`
      );
    } else {
      updatedItem = await assetsService.update(
        assetId,
        {
          availableStatus: ENUMS.AVAILABLE_STATUS.AVAILABLE,
          custodianStaffId: "",
          ...(postCondition ? { currentCondition: postCondition } : {}),
        },
        receivedByStaffId,
        remarks ||
          `Asset returned to available stock${
            issue ? ` (issue #${issue.$id.slice(-8)})` : ""
          }`
      );
    }

    await writeAssetEvent(
      assetId,
      ENUMS.EVENT_TYPE.RETURNED,
      isConsumable ? String(issue?.quantity || 1) : asset.availableStatus,
      isConsumable ? "RESTOCKED" : ENUMS.AVAILABLE_STATUS.AVAILABLE,
      receivedByStaffId,
      remarks || "Item marked as returned by admin"
    );

    return { returnRecord, asset: updatedItem, issue };
  },
};

// Asset Events operations (no org in query to avoid 400)
export const assetEventsService = {
  async list(queries = []) {
    const result = await listWithoutOrgFilter(COLLECTIONS.ASSET_EVENTS, queries, 2000);
    return {
      ...result,
      documents: (result.documents || []).map((event) => ({
        ...event,
      })),
    };
  },

  async getByAssetId(assetId) {
    const result = await listWithoutOrgFilter(
      COLLECTIONS.ASSET_EVENTS,
      [
        Query.equal("assetId", assetId),
        Query.orderDesc("at"),
      ],
      500
    );
    return {
      ...result,
      documents: (result.documents || []).map((event) => ({
        ...event,
      })),
    };
  },

  async create(data) {
    return await databases.createDocument(
      APPWRITE_CONFIG.databaseId,
      COLLECTIONS.ASSET_EVENTS,
      ID.unique(),
      data
    );
  },
};

// Storage operations
export const storageService = {
  async uploadFile(bucketId, file, fileId = "unique()") {
    return await storage.createFile(bucketId, fileId, file);
  },

  async getFile(bucketId, fileId) {
    return await storage.getFile(bucketId, fileId);
  },

  async getFilePreview(bucketId, fileId, width = 400, height = 400) {
    return storage.getFilePreview(bucketId, fileId, width, height);
  },

  async getFileDownload(bucketId, fileId) {
    return storage.getFileDownload(bucketId, fileId);
  },

  async deleteFile(bucketId, fileId) {
    return await storage.deleteFile(bucketId, fileId);
  },
};

// Authentication context and provider
const AuthContext = createContext({});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const currentUser = await account.get();
      setUser(currentUser);

      // Get staff record
      const staffRecord = await staffService.getByUserId(currentUser.$id);
      setStaff(staffRecord);
    } catch (error) {
      setUser(null);
      setStaff(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      await account.createEmailPasswordSession(email, password);
      await checkAuth();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const logout = async () => {
    try {
      await account.deleteSession("current");
      setUser(null);
      setStaff(null);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const value = {
    user,
    staff,
    loading,
    login,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export {
  returnReportsService,
  isCatalogAvailabilityReady,
  needsReturnExceptionL2,
  mapReportConditionToDelta,
  mapReportConditionToPostCondition,
  resolveIssueReturnable,
} from "../services/return-reports.js";

