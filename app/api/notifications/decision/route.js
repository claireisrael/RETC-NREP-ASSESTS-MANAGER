import { NextResponse } from "next/server";
import { NodemailerService } from "../../../../lib/services/nodemailer.js";
import { renderEmailTemplate } from "../../../../lib/services/email-templates.js";
import { resolveEmailBranding } from "../../../../lib/utils/email-branding.js";
import { resolveStaffRecipient } from "../../../../lib/services/resolve-recipient.js";
import {
  buildItemsSummary,
  buildItemsListHtml,
  buildRequestSubjectPhrase,
  formatItemLabel,
} from "../../../../lib/utils/approvers.js";
import { createAdminClient } from "../../../../lib/appwrite/admin.js";
import { COLLECTIONS } from "../../../../lib/appwrite/config.js";

/**
 * Server-side decision emails (denial / etc.) so delivery does not depend on
 * the browser fetch path alone, and requester email can be resolved via Auth.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      type = "REQUEST_DENIED",
      requesterStaffId,
      requester: requesterInput,
      request: requestDoc,
      approverName,
      reason,
      items = [],
    } = body;

    if (type !== "REQUEST_DENIED") {
      return NextResponse.json(
        { success: false, error: `Unsupported notification type: ${type}` },
        { status: 400 }
      );
    }

    let recipient = null;
    if (requesterInput?.email) {
      recipient = {
        ...requesterInput,
        email: String(requesterInput.email).trim().toLowerCase(),
      };
    } else {
      try {
        recipient = await resolveStaffRecipient(
          requesterStaffId || requesterInput?.$id
        );
      } catch (lookupError) {
        console.warn("Decision email recipient lookup failed:", lookupError);
      }
    }

    // Last resort: load staff from DB then Auth user
    if (!recipient?.email && requesterStaffId) {
      try {
        recipient = await resolveStaffRecipient(requesterStaffId);
      } catch {
        /* already logged */
      }
    }

    if (!recipient?.email) {
      console.warn("REQUEST_DENIED skipped: no requester email");
      return NextResponse.json(
        {
          success: false,
          skipped: true,
          reason: "no_requester_email",
          error:
            "Could not find an email for the requester. Check their staff/Auth profile.",
        },
        { status: 422 }
      );
    }

    // Prefer item docs from the client; otherwise load from request IDs.
    let resolvedItems = Array.isArray(items)
      ? items.filter((i) => i && (i.name || i.assetTag))
      : [];
    if (resolvedItems.length === 0 && requestDoc?.requestedItems?.length) {
      try {
        const { databases, databaseId } = createAdminClient();
        const loaded = await Promise.all(
          requestDoc.requestedItems.map((id) =>
            databases
              .getDocument(databaseId, COLLECTIONS.ASSETS, id)
              .catch(() => null)
          )
        );
        resolvedItems = loaded.filter(Boolean);
      } catch (itemsError) {
        console.warn("Decision email items resolve failed:", itemsError);
      }
    }

    const summary = buildItemsSummary(resolvedItems);
    const data = {
      requesterName: recipient.name || "Colleague",
      itemsSummary: summary || "your request",
      itemsListHtml: buildItemsListHtml(resolvedItems),
      requestPhrase: buildRequestSubjectPhrase(resolvedItems),
      assetName: summary || "your request",
      itemLabels: resolvedItems.map(formatItemLabel).filter(Boolean),
      requestId: requestDoc?.$id,
      approverName: approverName || "Approver",
      denialReason: reason || "No reason provided",
      purpose: requestDoc?.purpose || null,
      orgId: requestDoc?.orgId || recipient?.orgId,
      orgCode: requestDoc?.orgCode || recipient?.orgCode,
      requester: recipient,
    };

    const branding = resolveEmailBranding({
      request: requestDoc,
      requester: recipient,
      orgId: data.orgId,
      orgCode: data.orgCode,
    });

    const rendered = renderEmailTemplate("REQUEST_DENIED", data, branding);
    const result = await NodemailerService.sendNotification(
      "REQUEST_DENIED",
      recipient.email,
      data,
      rendered
    );

    if (result?.skipped) {
      return NextResponse.json(
        {
          success: false,
          skipped: true,
          reason: result.reason,
          error: "SMTP is not configured",
        },
        { status: 503 }
      );
    }

    console.log(
      "REQUEST_DENIED email sent to",
      recipient.email,
      result?.messageId
    );

    return NextResponse.json({
      success: true,
      messageId: result?.messageId,
      recipient: recipient.email,
      type: "REQUEST_DENIED",
    });
  } catch (error) {
    console.error("Decision notification failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to send decision email",
      },
      { status: 500 }
    );
  }
}
