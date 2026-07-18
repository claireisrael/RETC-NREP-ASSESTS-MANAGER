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

async function sendTemplate(type, emails, data, branding) {
  const list = [
    ...new Set(
      (Array.isArray(emails) ? emails : [emails])
        .map((e) => String(e || "").trim().toLowerCase())
        .filter((e) => e.includes("@"))
    ),
  ];
  if (list.length === 0) {
    return { sent: false, reason: "no_recipients", emails: [] };
  }

  const rendered = renderEmailTemplate(type, data, branding);
  const result = await NodemailerService.sendNotification(
    type,
    list,
    data,
    rendered
  );

  if (result?.skipped) {
    return {
      sent: false,
      skipped: true,
      reason: result.reason || "smtp_not_configured",
      emails: list,
    };
  }

  return {
    sent: true,
    messageId: result?.messageId,
    emails: list,
  };
}

/**
 * Server-side approval workflow emails.
 * Types:
 *  - REQUEST_CREATED  → all L1 approvers
 *  - L1_APPROVED      → assigned L2 (awaiting) + requester (L1 done)
 *  - FINAL_APPROVED   → requester + L2 approver confirmation
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
      const { emails } = await getApproverRecipientsServer("L1");
      results.l1 = await sendTemplate(
        "REQUEST_AWAITING_L1",
        emails,
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
      let l2Emails = [];
      const assigneeId = assignedL2StaffId || requestDoc.assignedL2StaffId;
      if (assigneeId) {
        const assigned = await resolveApproverEmailByStaffId(assigneeId);
        if (assigned?.email) l2Emails = [assigned.email];
      }
      if (l2Emails.length === 0) {
        const { emails } = await getApproverRecipientsServer("L2");
        l2Emails = emails;
      }

      results.l2 = await sendTemplate(
        "REQUEST_AWAITING_L2",
        l2Emails,
        {
          ...baseData,
          l1ApproverName: approverInput?.name || null,
        },
        branding
      );

      if (requester?.email) {
        results.requester = await sendTemplate(
          "REQUEST_L1_APPROVED",
          requester.email,
          {
            ...baseData,
            approverName: approverInput?.name || null,
          },
          branding
        );
      } else {
        results.requester = { sent: false, reason: "no_requester_email" };
      }

      console.log(
        "L1_APPROVED L2 emails:",
        results.l2.emails,
        results.l2.sent ? "sent" : results.l2.reason
      );

      return NextResponse.json({
        success: !!(results.l2.sent || results.requester.sent),
        results,
      });
    }

    if (type === "FINAL_APPROVED") {
      if (requester?.email) {
        results.requester = await sendTemplate(
          "REQUEST_APPROVED",
          requester.email,
          {
            ...baseData,
            approverName: approverInput?.name || "Superadmin",
            approvalNotes: requestDoc.decisionNotes || null,
          },
          branding
        );
      } else {
        results.requester = { sent: false, reason: "no_requester_email" };
      }

      // Confirmation to the final approver (and other L2s so both Mukisa/Paul are informed)
      const { emails: l2Emails } = await getApproverRecipientsServer("L2");
      const approverEmail = approverInput?.email
        ? String(approverInput.email).trim().toLowerCase()
        : null;
      const confirmRecipients = [
        ...new Set([...(approverEmail ? [approverEmail] : []), ...l2Emails]),
      ];

      if (confirmRecipients.length > 0) {
        results.l2 = await sendTemplate(
          "REQUEST_L2_DECISION_CONFIRM",
          confirmRecipients,
          {
            ...baseData,
            approverName: approverInput?.name || "Superadmin",
            decision: "approved",
          },
          branding
        );
      } else {
        results.l2 = { sent: false, reason: "no_l2_emails" };
      }

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

      results.requester = await sendTemplate(
        "ASSET_ISSUED",
        requester.email,
        {
          ...baseData,
          issuerName: approverInput?.name || "Stores team",
          issuanceNotes:
            "Your consumable request was approved and the item(s) have been issued to you.",
          isConsumable: true,
        },
        branding
      );

      const { emails: l2Emails } = await getApproverRecipientsServer("L2");
      if (l2Emails.length > 0) {
        results.l2 = await sendTemplate(
          "REQUEST_L2_DECISION_CONFIRM",
          l2Emails,
          {
            ...baseData,
            approverName: approverInput?.name || "Superadmin",
            decision: "approved_and_issued",
          },
          branding
        );
      }

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
