/**
 * Best-effort email helpers for return reports and L2 availability confirmation.
 */

import { getApproverRecipients, listSuperadminStaff } from "../utils/approvers.js";
import { staffService } from "../appwrite/provider.js";

async function sendEmail(type, recipient, data) {
  if (!recipient) return { sent: false, reason: "no_recipient" };
  try {
    const apiResponse = await fetch("/api/notifications/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, recipient, data }),
    });
    const result = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      console.warn("email notification failed:", type, result);
      return { sent: false, result };
    }
    return { sent: !result?.skipped, result };
  } catch (error) {
    console.warn("email notification error:", type, error);
    return { sent: false, error: error?.message || String(error) };
  }
}

async function emailsForStaffIds(ids = []) {
  const emails = [];
  for (const id of ids.filter(Boolean)) {
    try {
      const s = await staffService.get(id);
      if (s?.email) emails.push(s.email.trim().toLowerCase());
    } catch {
      /* skip */
    }
  }
  return [...new Set(emails)];
}

/** Holder submitted a return report → notify asset admins (L1). */
export async function notifyReturnReportSubmitted({
  report,
  item,
  requester,
  orgId,
  orgCode,
}) {
  try {
    const { emails } = await getApproverRecipients("L1");
    const payload = {
      itemName: item?.name || "Item",
      assetTag: item?.assetTag || "",
      condition: report?.reportedCondition || "",
      requesterName: requester?.name || "Staff member",
      reportId: report?.$id,
      issueId: report?.issueId,
      reason: report?.reason || "",
      orgId: orgId || report?.orgId,
      orgCode,
    };
    const results = [];
    for (const email of emails) {
      results.push(
        await sendEmail("RETURN_REPORT_SUBMITTED", email, payload)
      );
    }
    return results;
  } catch (error) {
    console.warn("notifyReturnReportSubmitted failed:", error);
    return [];
  }
}

/** Admin confirmed a good/fair return → awareness email to assigned L2 (or all L2). */
export async function notifyReturnReportAwareness({
  report,
  item,
  adminStaff,
  orgId,
  orgCode,
}) {
  try {
    let emails = await emailsForStaffIds([report?.assignedL2StaffId]);
    if (!emails.length) {
      const { emails: l2 } = await getApproverRecipients("L2");
      emails = l2;
    }
    const payload = {
      itemName: item?.name || "Item",
      condition: report?.reportedCondition || "",
      adminName: adminStaff?.name || "Asset admin",
      reportId: report?.$id,
      orgId: orgId || report?.orgId,
      orgCode,
      actionRequired: false,
    };
    const results = [];
    for (const email of emails) {
      results.push(
        await sendEmail("RETURN_REPORT_L2_AWARENESS", email, payload)
      );
    }
    return results;
  } catch (error) {
    console.warn("notifyReturnReportAwareness failed:", error);
    return [];
  }
}

/** Poor/lost → L2 must acknowledge write-off. */
export async function notifyReturnReportNeedsL2({
  report,
  item,
  adminStaff,
  orgId,
  orgCode,
}) {
  try {
    let emails = await emailsForStaffIds([report?.assignedL2StaffId]);
    if (!emails.length) {
      const { emails: l2 } = await getApproverRecipients("L2");
      emails = l2;
    }
    const payload = {
      itemName: item?.name || "Item",
      condition: report?.reportedCondition || "",
      adminName: adminStaff?.name || "Asset admin",
      reason: report?.reason || "",
      recommendation: report?.recommendation || "",
      reportId: report?.$id,
      orgId: orgId || report?.orgId,
      orgCode,
      actionRequired: true,
    };
    const results = [];
    for (const email of emails) {
      results.push(
        await sendEmail("RETURN_REPORT_NEEDS_L2", email, payload)
      );
    }
    return results;
  } catch (error) {
    console.warn("notifyReturnReportNeedsL2 failed:", error);
    return [];
  }
}

/** New catalog item awaiting L2 availability confirmation. */
export async function notifyAvailabilityPending({
  item,
  assignedL2StaffId,
  createdBy,
  orgId,
  orgCode,
}) {
  try {
    let emails = await emailsForStaffIds([assignedL2StaffId]);
    if (!emails.length) {
      const supers = await listSuperadminStaff();
      emails = supers.map((s) => s.email).filter(Boolean);
    }
    const payload = {
      itemName: item?.name || "Catalog item",
      itemType: item?.itemType || "",
      assetTag: item?.assetTag || "",
      createdByName: createdBy?.name || "Admin",
      itemId: item?.$id,
      orgId: orgId || item?.orgId,
      orgCode,
    };
    const results = [];
    for (const email of emails) {
      results.push(
        await sendEmail("CATALOG_AVAILABILITY_PENDING", email, payload)
      );
    }
    return results;
  } catch (error) {
    console.warn("notifyAvailabilityPending failed:", error);
    return [];
  }
}

/** L2 decided availability → notify the admin who created / manages catalog. */
export async function notifyAvailabilityDecided({
  item,
  decidedBy,
  confirmed,
  note,
  notifyStaffId,
  orgId,
  orgCode,
}) {
  try {
    let emails = await emailsForStaffIds(
      [notifyStaffId, item?.createdByStaffId].filter(Boolean)
    );
    if (!emails.length) {
      const { emails: l1 } = await getApproverRecipients("L1");
      emails = l1;
    }
    const payload = {
      itemName: item?.name || "Catalog item",
      confirmed: Boolean(confirmed),
      decidedByName: decidedBy?.name || "L2",
      note: note || "",
      itemId: item?.$id,
      orgId: orgId || item?.orgId,
      orgCode,
    };
    const results = [];
    for (const email of [...new Set(emails)]) {
      results.push(
        await sendEmail("CATALOG_AVAILABILITY_DECIDED", email, payload)
      );
    }
    return results;
  } catch (error) {
    console.warn("notifyAvailabilityDecided failed:", error);
    return [];
  }
}
