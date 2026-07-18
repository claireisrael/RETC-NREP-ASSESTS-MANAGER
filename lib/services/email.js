import { renderEmailTemplate } from "./email-templates.js";
import { ENUMS } from "../appwrite/config.js";
import { resolveEmailBranding } from "../utils/email-branding.js";

// Email notification types
export const EMAIL_TYPES = {
  REQUEST_SUBMITTED: "REQUEST_SUBMITTED",
  REQUEST_AWAITING_L1: "REQUEST_AWAITING_L1",
  REQUEST_AWAITING_L2: "REQUEST_AWAITING_L2",
  REQUEST_L1_APPROVED: "REQUEST_L1_APPROVED",
  REQUEST_APPROVED: "REQUEST_APPROVED",
  REQUEST_L2_DECISION_CONFIRM: "REQUEST_L2_DECISION_CONFIRM",
  REQUEST_DENIED: "REQUEST_DENIED",
  ASSET_ISSUED: "ASSET_ISSUED",
  ASSET_ASSIGNED: "ASSET_ASSIGNED",
  ASSET_AVAILABLE: "ASSET_AVAILABLE",
  RETURN_REMINDER: "RETURN_REMINDER",
  RETURN_OVERDUE: "RETURN_OVERDUE",
  MAINTENANCE_DUE: "MAINTENANCE_DUE",
  ASSET_RETURNED: "ASSET_RETURNED",
  SYSTEM_ALERT: "SYSTEM_ALERT",
  PASSWORD_RESET: "PASSWORD_RESET",
};

// Client-safe email service - always uses API endpoints with template rendering
export class EmailService {
  static async sendNotification(type, recipient, data, branding = null) {
    try {
      const emailBranding =
        branding ||
        resolveEmailBranding({
          orgId: data?.orgId,
          orgCode: data?.orgCode,
          request: data,
          requester: data?.requester,
          branding,
        });

      // Always use API route for client-server compatibility
      const apiResponse = await fetch("/api/notifications/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          recipient,
          data,
          branding: emailBranding,
        }),
      });

      if (!apiResponse.ok) {
        throw new Error(`API request failed: ${apiResponse.statusText}`);
      }

      const result = await apiResponse.json();
      console.log("Email notification sent via API:", result.messageId);
      return result;
    } catch (error) {
      console.error("Error sending email notification:", error);
      // Don't throw in client context to prevent app crashes
      console.warn("Email notification failed, but continuing execution");
      return { success: false, error: error.message };
    }
  }

  /**
   * Render email template locally (for preview or testing)
   */
  static renderTemplate(type, data, branding = null) {
    try {
      return renderEmailTemplate(type, data, branding);
    } catch (error) {
      console.error("Error rendering email template:", error);
      throw error;
    }
  }

  /**
   * Send system alert email
   */
  static async sendSystemAlert(alertType, severity, details, branding = null) {
    const data = {
      alertType,
      severity,
      details,
      timestamp: new Date().toISOString(),
    };

    await this.sendNotification(
      EMAIL_TYPES.SYSTEM_ALERT,
      "admins",
      data,
      branding
    );
  }

  static async sendRequestSubmitted(request, requester, asset) {
    const data = {
      requesterName: requester.name,
      assetName: asset.name,
      requestId: request.$id,
      purpose: request.purpose,
      expectedReturnDate: request.expected_return_date,
    };

    // Send to admins
    await this.sendNotification(EMAIL_TYPES.REQUEST_SUBMITTED, "admins", data);
  }

  static async sendRequestApproved(request, requester, asset, approver) {
    const data = {
      requesterName: requester.name,
      assetName: asset.name,
      requestId: request.$id,
      approverName: approver.name,
      approvalNotes: request.approval_notes,
    };

    await this.sendNotification(
      EMAIL_TYPES.REQUEST_APPROVED,
      requester.email,
      data
    );
  }

  static async sendRequestDenied(request, requester, asset, approver) {
    const denialReason =
      request.decisionNotes ||
      request.denialReason ||
      request.approval_notes ||
      request.notes ||
      "No reason provided";

    const data = {
      requesterName: requester.name,
      assetName: asset?.name || asset?.itemsSummary || "Requested item(s)",
      itemsSummary: asset?.name || null,
      requestId: request.$id,
      approverName: approver.name,
      denialReason,
      orgId: request.orgId || requester?.orgId,
      orgCode: request.orgCode || requester?.orgCode,
      requester,
    };

    await this.sendNotification(
      EMAIL_TYPES.REQUEST_DENIED,
      requester.email,
      data,
      resolveEmailBranding({ request, requester })
    );
  }

  static async sendAssetIssued(request, requester, asset, issuer) {
    const items = Array.isArray(asset) ? asset : asset ? [asset] : [];
    const { buildItemsSummary, buildItemsListHtml, buildRequestSubjectPhrase } =
      await import("../utils/approvers.js");
    const summary =
      buildItemsSummary(items) ||
      asset?.name ||
      "the item you requested";

    const data = {
      requesterName: requester.name,
      assetName: summary,
      itemsSummary: summary,
      itemsListHtml: buildItemsListHtml(items),
      requestPhrase: buildRequestSubjectPhrase(items),
      requestId: request.$id,
      issuerName: issuer.name,
      expectedReturnDate:
        request.expectedReturnDate || request.expected_return_date,
      issuanceNotes:
        request.handoverNote ||
        request.issuance_notes ||
        request.issuanceNotes ||
        null,
      orgId: request.orgId || requester?.orgId,
      orgCode: request.orgCode || requester?.orgCode,
      requester,
    };

    await this.sendNotification(
      EMAIL_TYPES.ASSET_ISSUED,
      requester.email,
      data,
      resolveEmailBranding({ request, requester })
    );
  }

  static async sendAssetAssigned(asset, custodian, assigner, notes = null) {
    const data = {
      custodianName: custodian.name,
      assetName: asset.name,
      assetTag: asset.assetTag,
      assetId: asset.$id,
      assignerName: assigner?.name || "System",
      assignmentDate: new Date().toISOString(),
      notes: notes,
      locationName: asset.locationName,
      roomOrArea: asset.roomOrArea,
      currentCondition: asset.currentCondition,
    };

    await this.sendNotification(
      EMAIL_TYPES.ASSET_ASSIGNED,
      custodian.email,
      data
    );
  }

  static async sendReturnReminder(request, requester, asset) {
    const data = {
      requesterName: requester.name,
      assetName: asset.name,
      requestId: request.$id,
      expectedReturnDate: request.expected_return_date,
      daysUntilDue: Math.ceil(
        (new Date(request.expected_return_date) - new Date()) /
          (1000 * 60 * 60 * 24)
      ),
    };

    await this.sendNotification(
      EMAIL_TYPES.RETURN_REMINDER,
      requester.email,
      data
    );
  }

  static async sendAssetAvailable(asset, requester) {
    const data = {
      requesterName: requester.name,
      assetName: asset.name,
      assetTag: asset.assetTag,
      assetId: asset.$id,
      category: asset.category,
      locationName: asset.locationName,
      roomOrArea: asset.roomOrArea,
      currentCondition: asset.currentCondition,
    };

    await this.sendNotification(
      EMAIL_TYPES.ASSET_AVAILABLE,
      requester.email,
      data
    );
  }

  static async sendSystemAnnouncement(announcement, staff) {
    const data = {
      staffName: staff.name,
      announcementTitle: announcement.title || "System Announcement",
      announcementMessage: announcement.message,
      announcementDate: new Date().toISOString(),
    };

    await this.sendNotification(EMAIL_TYPES.SYSTEM_ALERT, staff.email, data);
  }

  static async sendReturnOverdue(request, requester, asset) {
    const data = {
      requesterName: requester.name,
      assetName: asset.name,
      requestId: request.$id,
      expectedReturnDate: request.expected_return_date,
      daysOverdue: Math.ceil(
        (new Date() - new Date(request.expected_return_date)) /
          (1000 * 60 * 60 * 24)
      ),
    };

    await this.sendNotification(
      EMAIL_TYPES.RETURN_OVERDUE,
      requester.email,
      data
    );
  }

  static async sendAssetReturned(request, requester, asset, returnCondition) {
    const data = {
      requesterName: requester.name,
      assetName: asset.name,
      requestId: request.$id,
      returnDate: new Date().toISOString(),
      returnCondition: returnCondition,
    };

    await this.sendNotification(EMAIL_TYPES.ASSET_RETURNED, "admins", data);
  }
}
