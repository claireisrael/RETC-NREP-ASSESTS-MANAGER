import { EmailService, EMAIL_TYPES } from "./email.js";
import {
  getApproverRecipients,
  buildItemsSummary,
  buildItemsListHtml,
  buildRequestSubjectPhrase,
  formatItemLabel,
} from "../utils/approvers.js";
import { resolveEmailBranding } from "../utils/email-branding.js";

function withOrgContext(request, requester, payload = {}) {
  return {
    ...payload,
    orgId: request?.orgId || requester?.orgId,
    orgCode: request?.orgCode || requester?.orgCode,
    requester,
  };
}

/**
 * Ensure we have real item documents (name/tag/type) for email copy.
 * Falls back to loading from Appwrite when the caller only has IDs.
 */
async function resolveItemsForEmail(request, items = []) {
  const usable = (items || []).filter(
    (item) => item && (item.name || item.assetTag || item.title)
  );
  if (usable.length > 0) return usable;

  const ids = Array.isArray(request?.requestedItems)
    ? request.requestedItems
    : [];
  if (ids.length === 0) return [];

  try {
    const { assetsService } = await import("../appwrite/provider.js");
    const loaded = await Promise.all(
      ids.map(async (id) => {
        try {
          return await assetsService.get(id);
        } catch {
          return null;
        }
      })
    );
    return loaded.filter(Boolean);
  } catch (error) {
    console.warn("resolveItemsForEmail failed:", error);
    return [];
  }
}

function itemEmailFields(items) {
  const summary = buildItemsSummary(items);
  return {
    itemsSummary: summary || "the items you requested",
    itemsListHtml: buildItemsListHtml(items),
    requestPhrase: buildRequestSubjectPhrase(items),
    assetName: summary || "the items you requested",
    itemLabels: (items || []).map(formatItemLabel).filter(Boolean),
  };
}

/**
 * Centralized notifications for the two-step (L1 -> L2) approval workflow.
 * Recipients are resolved from Appwrite staff roles at call time, so who gets
 * notified is controlled purely by role assignment in Appwrite.
 *
 * All functions are best-effort: email failures are logged, never thrown,
 * so they can't break the request/approval action.
 */

// New request created -> notify L1 approvers.
export async function notifyRequestCreated(request, requester, items = []) {
  try {
    const { emails } = await getApproverRecipients("L1");
    if (emails.length === 0) return;

    const resolved = await resolveItemsForEmail(request, items);
    const itemFields = itemEmailFields(resolved);

    await EmailService.sendNotification(
      EMAIL_TYPES.REQUEST_AWAITING_L1,
      emails,
      withOrgContext(request, requester, {
        requesterName: requester?.name || "A user",
        ...itemFields,
        requestId: request.$id,
        purpose: request.purpose,
        expectedReturnDate: request.expectedReturnDate,
      }),
      resolveEmailBranding({ request, requester })
    );
  } catch (error) {
    console.warn("notifyRequestCreated failed:", error);
  }
}

// L1 approved -> notify L2 superadmins + let the requester know it progressed.
export async function notifyL1Approved(request, requester, l1Approver, items = []) {
  const recipient = await resolveRequester(request, requester);
  const resolved = await resolveItemsForEmail(request, items);
  const itemFields = itemEmailFields(resolved);

  try {
    const { emails } = await getApproverRecipients("L2");
    if (emails.length > 0) {
      await EmailService.sendNotification(
        EMAIL_TYPES.REQUEST_AWAITING_L2,
        emails,
        withOrgContext(request, recipient, {
          requesterName: recipient?.name || requester?.name || "A user",
          ...itemFields,
          requestId: request.$id,
          purpose: request.purpose,
          expectedReturnDate: request.expectedReturnDate,
          l1ApproverName: l1Approver?.name || null,
        }),
        resolveEmailBranding({ request, requester: recipient || requester })
      );
    }
  } catch (error) {
    console.warn("notifyL1Approved (L2 notice) failed:", error);
  }

  try {
    if (!recipient?.email) {
      console.warn("notifyL1Approved: no requester email — requester notice skipped");
      return;
    }
    await EmailService.sendNotification(
      EMAIL_TYPES.REQUEST_L1_APPROVED,
      recipient.email,
      withOrgContext(request, recipient, {
        requesterName: recipient.name,
        ...itemFields,
        requestId: request.$id,
        approverName: l1Approver?.name || null,
      }),
      resolveEmailBranding({ request, requester: recipient })
    );
  } catch (error) {
    console.warn("notifyL1Approved (requester notice) failed:", error);
  }
}

async function resolveRequester(request, requester) {
  if (requester?.email) return requester;
  if (!request?.requesterStaffId) return requester || null;
  try {
    const { staffService } = await import("../appwrite/provider.js");
    return await staffService.get(request.requesterStaffId);
  } catch (error) {
    console.warn("resolveRequester failed:", error);
    return requester || null;
  }
}

// Final (L2) approval -> notify requester (assets still awaiting store issue).
export async function notifyFinalApproved(request, requester, l2Approver, items = []) {
  try {
    const recipient = await resolveRequester(request, requester);
    if (!recipient?.email) {
      console.warn("notifyFinalApproved: no requester email — skipped");
      return { sent: false, reason: "no_requester_email" };
    }
    const resolved = await resolveItemsForEmail(request, items);
    const itemFields = itemEmailFields(resolved);

    const result = await EmailService.sendNotification(
      EMAIL_TYPES.REQUEST_APPROVED,
      recipient.email,
      withOrgContext(request, recipient, {
        requesterName: recipient.name,
        ...itemFields,
        requestId: request.$id,
        approverName: l2Approver?.name || "Superadmin",
        approvalNotes: request.decisionNotes || null,
        purpose: request.purpose || null,
      }),
      resolveEmailBranding({ request, requester: recipient })
    );
    return { sent: !result?.skipped && result?.success !== false, result };
  } catch (error) {
    console.warn("notifyFinalApproved failed:", error);
    return { sent: false, error: error.message || String(error) };
  }
}

/**
 * Consumables are auto-issued on final approval — tell the requester what they got.
 * This is the email users expect after a consumable request completes all stages.
 */
export async function notifyConsumablesIssued(
  request,
  requester,
  issuer,
  items = []
) {
  try {
    const recipient = await resolveRequester(request, requester);
    if (!recipient?.email) {
      console.warn("notifyConsumablesIssued: no requester email — skipped");
      return { sent: false, reason: "no_requester_email" };
    }

    const resolved = await resolveItemsForEmail(request, items);
    const itemFields = itemEmailFields(resolved);
    const branding = resolveEmailBranding({ request, requester: recipient });

    const result = await EmailService.sendNotification(
      EMAIL_TYPES.ASSET_ISSUED,
      recipient.email,
      withOrgContext(request, recipient, {
        requesterName: recipient.name || "Colleague",
        ...itemFields,
        requestId: request.$id,
        issuerName: issuer?.name || "Stores team",
        expectedReturnDate: request.expectedReturnDate || null,
        issuanceNotes:
          "Your consumable request was approved and the item(s) have been issued to you.",
        purpose: request.purpose || null,
        isConsumable: true,
      }),
      branding
    );

    return { sent: !result?.skipped && result?.success !== false, result };
  } catch (error) {
    console.warn("notifyConsumablesIssued failed:", error);
    return { sent: false, error: error.message || String(error) };
  }
}

// Denied at any level -> notify requester with the reason (branded by their org).
// Uses a server API so we can resolve Auth emails and send reliably.
export async function notifyDenied(request, requester, approver, reason, items = []) {
  try {
    const payload = {
      type: "REQUEST_DENIED",
      requesterStaffId: request?.requesterStaffId || requester?.$id || null,
      requester: requester
        ? {
            $id: requester.$id,
            name: requester.name,
            email: requester.email,
            orgId: requester.orgId,
            orgCode: requester.orgCode,
            userId: requester.userId,
          }
        : null,
      request: {
        $id: request?.$id,
        purpose: request?.purpose,
        orgId: request?.orgId,
        orgCode: request?.orgCode,
        requestedItems: request?.requestedItems || [],
        decisionNotes: reason,
      },
      approverName: approver?.name || "Approver",
      reason: reason || "No reason provided",
      items: (items || []).map((item) => ({
        $id: item?.$id,
        name: item?.name,
        assetTag: item?.assetTag,
        itemType: item?.itemType,
        title: item?.title,
      })),
    };

    const apiResponse = await fetch("/api/notifications/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      console.warn("notifyDenied API failed:", result);
      return {
        sent: false,
        reason: result.reason || "api_error",
        error: result.error || apiResponse.statusText,
        result,
      };
    }

    return {
      sent: !result?.skipped && result?.success !== false,
      result,
    };
  } catch (error) {
    console.warn("notifyDenied failed:", error);
    return { sent: false, error: error.message || String(error) };
  }
}
