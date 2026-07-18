import { NextResponse } from "next/server";
import { NodemailerService } from "../../../../lib/services/nodemailer.js";
import { renderEmailTemplate } from "../../../../lib/services/email-templates.js";
import { resolveEmailBranding } from "../../../../lib/utils/email-branding.js";
import { resolveStaffRecipient } from "../../../../lib/services/resolve-recipient.js";
import {
  getApproverRecipientsServer,
  resolveApproverEmailByStaffId,
} from "../../../../lib/services/approver-recipients-server.js";
import {
  buildItemsSummary,
  buildItemsListHtml,
  buildRequestSubjectPhrase,
  formatItemLabel,
} from "../../../../lib/utils/approvers.js";
import { createAdminClient } from "../../../../lib/appwrite/admin.js";
import { COLLECTIONS } from "../../../../lib/appwrite/config.js";

async function resolveItems(requestDoc, items = []) {
  let resolved = Array.isArray(items)
    ? items.filter((i) => i && (i.name || i.assetTag || i.title))
    : [];
  if (resolved.length > 0) return resolved;

  const ids = Array.isArray(requestDoc?.requestedItems)
    ? requestDoc.requestedItems
    : [];
  if (!ids.length) return [];

  try {
    const { databases, databaseId } = createAdminClient();
    const loaded = await Promise.all(
      ids.map((id) =>
        databases
          .getDocument(databaseId, COLLECTIONS.ASSETS, id)
          .catch(() => null)
      )
    );
    return loaded.filter(Boolean);
  } catch (error) {
    console.warn("approval email items resolve failed:", error?.message);
    return [];
  }
}

function itemFields(items) {
  const summary = buildItemsSummary(items);
  return {
    itemsSummary: summary || "the items requested",
    itemsListHtml: buildItemsListHtml(items),
    requestPhrase: buildRequestSubjectPhrase(items),
    assetName: summary || "the items requested",
    itemLabels: (items || []).map(formatItemLabel).filter(Boolean),
  };
}

/** Send one branded email per recipient so we can personalize the greeting/name. */
async function sendPersonalized(type, recipients, sharedData, branding) {
  const people = (recipients || []).filter((r) => r?.email);
  if (people.length === 0) {
    return { sent: false, reason: "no_recipients", emails: [] };
  }

  const emails = [];
  const messageIds = [];
  let anySent = false;
  let skipReason = null;

  for (const person of people) {
    const email = String(person.email).trim().toLowerCase();
    if (!email.includes("@")) continue;

    const data = {
      ...sharedData,
      recipientName: person.name || sharedData.recipientName || null,
    };

    const rendered = renderEmailTemplate(type, data, branding);
    const result = await NodemailerService.sendNotification(
      type,
      email,
      data,
      rendered
    );

    if (result?.skipped) {
      skipReason = result.reason || "smtp_not_configured";
      continue;
    }

    anySent = true;
    emails.push(email);
    if (result?.messageId) messageIds.push(result.messageId);
  }

  if (!anySent) {
    return {
      sent: false,
      skipped: !!skipReason,
      reason: skipReason || "send_failed",
      emails: [],
    };
  }

  return {
    sent: true,
    emails,
    messageIds,
  };
}

async function resolveApproverPerson(approverInput, fallbackStaffId = null) {
  if (approverInput?.name && approverInput?.email) {
    return {
      ...approverInput,
      email: String(approverInput.email).trim().toLowerCase(),
      name: approverInput.name,
    };
  }

  const id = approverInput?.$id || fallbackStaffId;
  if (!id) {
    return approverInput?.name
      ? { name: approverInput.name, email: approverInput.email || null }
      : null;
  }

  try {
    const resolved = await resolveStaffRecipient(id);
    if (!resolved) return approverInput || null;
    return {
      ...resolved,
      name:
        resolved.name ||
        approverInput?.name ||
        resolved.email?.split("@")[0] ||
        "Superadmin",
      email: resolved.email || approverInput?.email || null,
    };
  } catch {
    return approverInput || null;
  }
}

/**
 * Server-side approval workflow emails.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      type,
      request: requestDoc,
      requester: requesterInput,
      approver: approverInput,
      items = [],
      assignedL2StaffId = null,
    } = body;

    if (!type || !requestDoc?.$id) {
      return NextResponse.json(
        { success: false, error: "Missing type or request" },
        { status: 400 }
      );
    }

    const resolvedItems = await resolveItems(requestDoc, items);
    const fields = itemFields(resolvedItems);

    let requester = null;
    if (requesterInput?.email) {
      requester = {
        ...requesterInput,
        email: String(requesterInput.email).trim().toLowerCase(),
        name: requesterInput.name || null,
      };
    } else if (requestDoc.requesterStaffId || requesterInput?.$id) {
      requester = await resolveStaffRecipient(
        requestDoc.requesterStaffId || requesterInput?.$id
      );
    }

    const branding = resolveEmailBranding({
      request: requestDoc,
      requester,
      orgId: requestDoc?.orgId || requester?.orgId,
      orgCode: requestDoc?.orgCode || requester?.orgCode,
    });

    const baseData = {
      ...fields,
      requestId: requestDoc.$id,
      purpose: requestDoc.purpose || null,
      expectedReturnDate: requestDoc.expectedReturnDate || null,
      orgId: requestDoc?.orgId || requester?.orgId,
      orgCode: requestDoc?.orgCode || requester?.orgCode,
      requester,
      requesterName: requester?.name || requesterInput?.name || "A user",
    };

    const results = {};

    if (type === "REQUEST_CREATED") {
      const { staff } = await getApproverRecipientsServer("L1");
      results.l1 = await sendPersonalized(
        "REQUEST_AWAITING_L1",
        staff,
        baseData,
        branding
      );
      console.log(
        "REQUEST_CREATED L1 emails:",
        results.l1.emails,
        results.l1.sent ? "sent" : results.l1.reason
      );
      return NextResponse.json({
        success: results.l1.sent,
        results,
      });
    }

    if (type === "L1_APPROVED") {
      const assigneeId = assignedL2StaffId || requestDoc.assignedL2StaffId;
      let assignedL2 = null;
      if (assigneeId) {
        assignedL2 = await resolveApproverEmailByStaffId(assigneeId);
      }

      let l2Recipients = assignedL2?.email ? [assignedL2] : [];
      if (l2Recipients.length === 0) {
        const { staff } = await getApproverRecipientsServer("L2");
        l2Recipients = staff;
      }

      const l2Name =
        assignedL2?.name ||
        l2Recipients[0]?.name ||
        null;

      const l1Person = await resolveApproverPerson(approverInput);

      results.l2 = await sendPersonalized(
        "REQUEST_AWAITING_L2",
        l2Recipients,
        {
          ...baseData,
          l1ApproverName: l1Person?.name || approverInput?.name || null,
          l2ApproverName: l2Name,
        },
        branding
      );

      if (requester?.email) {
        results.requester = await sendPersonalized(
          "REQUEST_L1_APPROVED",
          [requester],
          {
            ...baseData,
            approverName: l1Person?.name || approverInput?.name || null,
          },
          branding
        );
      } else {
        results.requester = { sent: false, reason: "no_requester_email" };
      }

      console.log(
        "L1_APPROVED L2:",
        l2Name,
        results.l2.emails,
        results.l2.sent ? "sent" : results.l2.reason
      );

      return NextResponse.json({
        success: !!(results.l2.sent || results.requester.sent),
        results,
      });
    }

    if (type === "FINAL_APPROVED") {
      const l2Person = await resolveApproverPerson(
        approverInput,
        requestDoc.l2ApproverStaffId || requestDoc.assignedL2StaffId
      );
      const l2Name = l2Person?.name || "Superadmin";

      if (requester?.email) {
        results.requester = await sendPersonalized(
          "REQUEST_APPROVED",
          [requester],
          {
            ...baseData,
            approverName: l2Name,
            l2ApproverName: l2Name,
            approvalNotes: requestDoc.decisionNotes || null,
          },
          branding
        );
      } else {
        results.requester = { sent: false, reason: "no_requester_email" };
      }

      const { staff: l2Staff } = await getApproverRecipientsServer("L2");
      const confirmRecipients = [...l2Staff];
      if (
        l2Person?.email &&
        !confirmRecipients.some(
          (s) =>
            String(s.email || "").toLowerCase() ===
            String(l2Person.email).toLowerCase()
        )
      ) {
        confirmRecipients.push(l2Person);
      }

      results.l2 = await sendPersonalized(
        "REQUEST_L2_DECISION_CONFIRM",
        confirmRecipients,
        {
          ...baseData,
          approverName: l2Name,
          l2ApproverName: l2Name,
          decision: "approved",
        },
        branding
      );

      return NextResponse.json({
        success: !!(results.requester.sent || results.l2?.sent),
        results,
      });
    }

    if (type === "CONSUMABLES_ISSUED") {
      if (!requester?.email) {
        return NextResponse.json(
          {
            success: false,
            skipped: true,
            reason: "no_requester_email",
          },
          { status: 422 }
        );
      }

      const l2Person = await resolveApproverPerson(
        approverInput,
        requestDoc.l2ApproverStaffId || requestDoc.assignedL2StaffId
      );
      const l2Name = l2Person?.name || approverInput?.name || "Superadmin";

      results.requester = await sendPersonalized(
        "ASSET_ISSUED",
        [requester],
        {
          ...baseData,
          issuerName: l2Name,
          approverName: l2Name,
          l2ApproverName: l2Name,
          issuanceNotes:
            "Your consumable request was approved and the item(s) have been issued to you.",
          isConsumable: true,
        },
        branding
      );

      const { staff: l2Staff } = await getApproverRecipientsServer("L2");
      results.l2 = await sendPersonalized(
        "REQUEST_L2_DECISION_CONFIRM",
        l2Staff,
        {
          ...baseData,
          approverName: l2Name,
          l2ApproverName: l2Name,
          decision: "approved_and_issued",
        },
        branding
      );

      return NextResponse.json({
        success: !!results.requester.sent,
        results,
      });
    }

    return NextResponse.json(
      { success: false, error: `Unsupported type: ${type}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("approval notification API failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to send approval notification",
      },
      { status: 500 }
    );
  }
}
