/**
 * Server-only: resolve L1 / L2 approver emails via Appwrite admin API.
 * Client sessions often cannot list other staff emails, which caused missing
 * approval notifications for L1 admins and L2 superadmins.
 */
import { createAdminClient } from "../appwrite/admin.js";
import { ENUMS, COLLECTIONS } from "../appwrite/config.js";
import { resolveStaffRecipient } from "./resolve-recipient.js";
import { filterL2FinalApprovers } from "../utils/approvers.js";

const APPROVER_ROLES = {
  L1: [ENUMS.ROLES.ASSET_ADMIN, ENUMS.ROLES.SENIOR_MANAGER],
  L2: [ENUMS.ROLES.SYSTEM_ADMIN],
};

/**
 * @param {"L1"|"L2"} level
 * @returns {Promise<{emails: string[], staff: object[]}>}
 */
export async function getApproverRecipientsServer(level) {
  const roles = APPROVER_ROLES[level] || [];
  if (roles.length === 0) return { emails: [], staff: [] };

  const { databases, databaseId, Query } = createAdminClient();
  const result = await databases.listDocuments(databaseId, COLLECTIONS.STAFF, [
    Query.limit(500),
  ]);
  const docs = result?.documents || [];

  const matched = docs.filter((s) => {
    if (!s || s.active === false) return false;
    if (!Array.isArray(s.roles)) return false;
    if (!s.roles.some((r) => roles.includes(r))) return false;
    // L1 mail goes only to L1 roles — never to dual-role superadmins.
    if (
      level === "L1" &&
      s.roles.includes(ENUMS.ROLES.SYSTEM_ADMIN)
    ) {
      return false;
    }
    return true;
  });

  const resolved = [];
  for (const member of matched) {
    try {
      const recipient = await resolveStaffRecipient(member);
      if (recipient?.email) resolved.push(recipient);
    } catch (error) {
      console.warn(
        `getApproverRecipientsServer: skip ${member?.$id}:`,
        error?.message || error
      );
    }
  }

  const emails = [
    ...new Set(resolved.map((s) => String(s.email).toLowerCase().trim())),
  ];

  const staffOut =
    level === "L2" ? filterL2FinalApprovers(resolved) : resolved;

  return {
    emails:
      level === "L2"
        ? staffOut.map((s) => String(s.email).toLowerCase().trim())
        : emails,
    staff: staffOut,
  };
}

/**
 * Resolve one staff member (by id) to a deliverable email.
 */
export async function resolveApproverEmailByStaffId(staffId) {
  if (!staffId) return null;
  try {
    const recipient = await resolveStaffRecipient(staffId);
    return recipient?.email ? recipient : null;
  } catch (error) {
    console.warn(
      "resolveApproverEmailByStaffId failed:",
      error?.message || error
    );
    return null;
  }
}
