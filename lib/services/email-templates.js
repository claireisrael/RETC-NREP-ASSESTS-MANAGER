// Email template configurations and HTML templates

const EMAIL_SIGNATURE = "Stores & Operations Team";

function formatEmailDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function emailSignOff() {
  return `<p>Best regards,<br>${EMAIL_SIGNATURE}</p>`;
}

/**
 * Base email template with org-specific branding (NREP / RETC).
 */
const baseTemplate = (content, branding = {}) => {
  const orgName =
    branding.orgName || "Renewable Energy Training Center (RETC)";
  const brandColor = branding.brandColor || "#059669";
  const accentColor = branding.accentColor || "#2563eb";
  const primaryDark = branding.primaryDark || brandColor;
  const isNrep = (branding.orgCode || "").toUpperCase() === "NREP";

  // Soft panels tinted from the brand (avoid generic green success boxes on NREP).
  const panelBg = isNrep ? "#eaf6fb" : "#ecfdf5";
  const panelBorder = isNrep ? "#b6dff0" : "#a7f3d0";
  const infoBg = isNrep ? "#f7fafc" : "#f0f9ff";
  const infoBorder = isNrep ? "#d6eaf3" : "#bae6fd";

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${orgName}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          line-height: 1.6;
          color: #374151;
          margin: 0;
          padding: 0;
          background-color: #f3f4f6;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, ${primaryDark} 0%, ${brandColor} 55%, ${accentColor} 100%);
          color: white;
          padding: 24px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 22px;
          font-weight: 600;
          letter-spacing: 0.01em;
        }
        .content {
          padding: 32px 24px;
        }
        .footer {
          background-color: #f3f4f6;
          padding: 16px 24px;
          text-align: center;
          font-size: 14px;
          color: #6b7280;
        }
        .button {
          display: inline-block;
          background-color: ${brandColor};
          color: white !important;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 500;
          margin: 16px 0;
        }
        .button:hover {
          background-color: ${primaryDark};
        }
        .info-box {
          background-color: ${infoBg};
          border: 1px solid ${infoBorder};
          border-radius: 6px;
          padding: 16px;
          margin: 16px 0;
        }
        .warning-box {
          background-color: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 6px;
          padding: 16px;
          margin: 16px 0;
        }
        .success-box {
          background-color: ${panelBg};
          border: 1px solid ${panelBorder};
          border-radius: 6px;
          padding: 16px;
          margin: 16px 0;
        }
        .details-table {
          width: 100%;
          border-collapse: collapse;
          margin: 16px 0;
        }
        .details-table th,
        .details-table td {
          padding: 8px 12px;
          text-align: left;
          border-bottom: 1px solid #e5e7eb;
        }
        .details-table th {
          background-color: rgba(255,255,255,0.55);
          font-weight: 500;
          color: #4b5563;
          width: 38%;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${orgName}</h1>
        </div>
        <div class="content">
          ${content}
        </div>
        <div class="footer">
          <p>This is an automated message from ${orgName}. Please do not reply to this email.</p>
          <p>&copy; ${new Date().getFullYear()} ${orgName}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `
}

/**
 * Email Templates
 */
export const EMAIL_TEMPLATES = {
  REQUEST_SUBMITTED: {
    subject: "New Asset Request Submitted - {requestId}",
    template: (data, branding) => {
      const content = `
        <h2>🔔 New Asset Request</h2>
        <p>Dear Admin,</p>
        <p>A new asset request has been submitted and requires your review.</p>
        
        <div class="info-box">
          <table class="details-table">
            <tr><th>Requester:</th><td>${data.requesterName}</td></tr>
            <tr><th>Asset:</th><td>${data.assetName}</td></tr>
            <tr><th>Request ID:</th><td>#${data.requestId}</td></tr>
            <tr><th>Purpose:</th><td>${data.purpose}</td></tr>
            <tr><th>Expected Return:</th><td>${formatEmailDate(data.expectedReturnDate)}</td></tr>
          </table>
        </div>
        
        <p>Please review this request in the admin panel:</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/requests" class="button">
          Review Request
        </a>
        
        <p>Best regards,<br>${EMAIL_SIGNATURE}</p>
      `
      return baseTemplate(content, branding)
    }
  },

  REQUEST_AWAITING_L1: {
    subject: (data) => {
      const item = data.itemsSummary || "a new request";
      return `Action needed: approve ${item}`;
    },
    template: (data, branding) => {
      const item = data.itemsSummary || data.assetName || "the requested items";
      const greeting = data.recipientName || "Approver";
      const content = `
        <h2 style="margin-top:0;color:#0f172a;">First-level approval needed</h2>
        <p>Dear ${greeting},</p>
        <p>
          <strong>${data.requesterName || "A colleague"}</strong> has submitted a request
          that needs your <strong>first-level (L1)</strong> review.
        </p>

        <div class="info-box">
          <p style="margin:0 0 8px;font-weight:600;color:#334155;">Request details</p>
          ${data.itemsListHtml || `<p style="margin:0;"><strong>${item}</strong></p>`}
          <table class="details-table" style="margin-top:12px;">
            <tr><th>Requester:</th><td>${data.requesterName || "—"}</td></tr>
            <tr><th>Request ID:</th><td>#${String(data.requestId || "").slice(-8).toUpperCase()}</td></tr>
            ${data.purpose ? `<tr><th>Purpose:</th><td>${data.purpose}</td></tr>` : ""}
            ${data.expectedReturnDate ? `<tr><th>Expected return:</th><td>${formatEmailDate(data.expectedReturnDate)}</td></tr>` : ""}
          </table>
        </div>

        <p>After you approve, a superadmin will give the final decision.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/admin/requests" class="button">
          Review request
        </a>
        ${emailSignOff()}
      `;
      return baseTemplate(content, branding);
    },
  },

  REQUEST_AWAITING_L2: {
    subject: (data) => {
      const item = data.itemsSummary || "a request";
      return `Final approval needed: ${item}`;
    },
    template: (data, branding) => {
      const item = data.itemsSummary || data.assetName || "the requested items";
      const greeting =
        data.recipientName || data.l2ApproverName || "Superadmin";
      const content = `
        <h2 style="margin-top:0;color:#0f172a;">Final approval needed</h2>
        <p>Dear ${greeting},</p>
        <p>
          A request has passed <strong>Level 1</strong> approval
          ${data.l1ApproverName ? ` by <strong>${data.l1ApproverName}</strong>` : ""}
          and is waiting for your <strong>final (L2)</strong> decision.
        </p>

        <div class="info-box">
          <p style="margin:0 0 8px;font-weight:600;color:#334155;">Request details</p>
          ${data.itemsListHtml || `<p style="margin:0;"><strong>${item}</strong></p>`}
          <table class="details-table" style="margin-top:12px;">
            <tr><th>Requester:</th><td>${data.requesterName || "—"}</td></tr>
            <tr><th>Assigned to:</th><td>${data.l2ApproverName || greeting}</td></tr>
            ${data.l1ApproverName ? `<tr><th>L1 approved by:</th><td>${data.l1ApproverName}</td></tr>` : ""}
            <tr><th>Request ID:</th><td>#${String(data.requestId || "").slice(-8).toUpperCase()}</td></tr>
            ${data.purpose ? `<tr><th>Purpose:</th><td>${data.purpose}</td></tr>` : ""}
            ${data.expectedReturnDate ? `<tr><th>Expected return:</th><td>${formatEmailDate(data.expectedReturnDate)}</td></tr>` : ""}
          </table>
        </div>

        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/admin/requests" class="button">
          Give final approval
        </a>
        ${emailSignOff()}
      `;
      return baseTemplate(content, branding);
    },
  },

  REQUEST_L1_APPROVED: {
    subject: (data) => {
      const item = data.itemsSummary || "your request";
      return `Update: ${item} — first approval done`;
    },
    template: (data, branding) => {
      const phrase =
        data.requestPhrase ||
        `your request for <strong>${data.itemsSummary || data.assetName || "the items you asked for"}</strong>`;
      const content = `
        <h2 style="margin-top:0;color:#0f172a;">First approval complete</h2>
        <p>Dear ${data.requesterName || "Colleague"},</p>
        <p>${phrase.charAt(0).toUpperCase() + phrase.slice(1)} has been cleared by ${data.approverName || "an approver"} and is now waiting for final approval.</p>

        <div class="info-box">
          <p style="margin:0 0 8px;font-weight:600;color:#334155;">What you asked for</p>
          ${data.itemsListHtml || `<p style="margin:0;"><strong>${data.itemsSummary || data.assetName || "—"}</strong></p>`}
          ${data.approverName ? `<p style="margin:12px 0 0;color:#475569;">Cleared by: ${data.approverName}</p>` : ""}
        </div>

        <p>We will email you again when the final decision is made.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/requests" class="button">
          View my requests
        </a>
        ${emailSignOff()}
      `;
      return baseTemplate(content, branding);
    },
  },

  REQUEST_APPROVED: {
    subject: (data) => {
      const item = data.itemsSummary || "your request";
      return `Approved: ${item}`;
    },
    template: (data, branding) => {
      const phrase =
        data.requestPhrase ||
        `your request for <strong>${data.itemsSummary || data.assetName || "the items you asked for"}</strong>`;
      const content = `
        <h2 style="margin-top:0;color:#0f172a;">Your request was approved</h2>
        <p>Dear ${data.requesterName || "Colleague"},</p>
        <p>Good news — ${phrase} has been <strong>approved</strong>${data.approverName ? ` by ${data.approverName}` : ""}.</p>

        <div class="success-box">
          <p style="margin:0 0 8px;font-weight:600;color:#334155;">Approved item(s)</p>
          ${data.itemsListHtml || `<p style="margin:0;"><strong>${data.itemsSummary || data.assetName || "—"}</strong></p>`}
          ${data.purpose ? `<p style="margin:12px 0 0;color:#475569;"><strong>Purpose:</strong> ${data.purpose}</p>` : ""}
          ${data.approvalNotes ? `<p style="margin:8px 0 0;color:#475569;"><strong>Note:</strong> ${data.approvalNotes}</p>` : ""}
        </div>

        <p>The store will prepare these for you. You will get another email when they are ready to collect.</p>

        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/requests" class="button">
          View my requests
        </a>

        ${emailSignOff()}
      `;
      return baseTemplate(content, branding);
    },
  },

  REQUEST_L2_DECISION_CONFIRM: {
    subject: (data) => {
      const item = data.itemsSummary || "a request";
      const issued = data.decision === "approved_and_issued";
      return issued
        ? `Final approval complete (issued): ${item}`
        : `Final approval recorded: ${item}`;
    },
    template: (data, branding) => {
      const item = data.itemsSummary || data.assetName || "the requested items";
      const issued = data.decision === "approved_and_issued";
      const l2Name = data.l2ApproverName || data.approverName || "Superadmin";
      const greeting = data.recipientName || "Superadmin";
      const content = `
        <h2 style="margin-top:0;color:#0f172a;">Final approval recorded</h2>
        <p>Dear ${greeting},</p>
        <p>
          <strong>${l2Name}</strong> has given <strong>final approval</strong>
          for the request below${issued ? ", and consumables were issued to the requester" : ""}.
        </p>

        <div class="success-box">
          <p style="margin:0 0 8px;font-weight:600;color:#334155;">Approved item(s)</p>
          ${data.itemsListHtml || `<p style="margin:0;"><strong>${item}</strong></p>`}
          <table class="details-table" style="margin-top:12px;">
            <tr><th>Requester:</th><td>${data.requesterName || "—"}</td></tr>
            <tr><th>Final approver:</th><td>${l2Name}</td></tr>
            <tr><th>Request ID:</th><td>#${String(data.requestId || "").slice(-8).toUpperCase()}</td></tr>
            ${data.purpose ? `<tr><th>Purpose:</th><td>${data.purpose}</td></tr>` : ""}
          </table>
        </div>

        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/admin/requests" class="button">
          Open admin requests
        </a>
        ${emailSignOff()}
      `;
      return baseTemplate(content, branding);
    },
  },

  REQUEST_DENIED: {
    subject: (data) => {
      const item = data.itemsSummary || "your request";
      return `Not approved: ${item}`;
    },
    template: (data, branding) => {
      const phrase =
        data.requestPhrase ||
        `your request for <strong>${data.itemsSummary || data.assetName || "the items you asked for"}</strong>`;
      const content = `
        <h2 style="margin-top:0;color:#0f172a;">Your request was not approved</h2>
        <p>Dear ${data.requesterName || "Colleague"},</p>
        <p>${phrase.charAt(0).toUpperCase() + phrase.slice(1)} has been reviewed and was <strong>not approved</strong>.</p>
        
        <div class="warning-box">
          <p style="margin:0 0 8px;font-weight:600;color:#334155;">Item(s) you asked for</p>
          ${data.itemsListHtml || `<p style="margin:0;"><strong>${data.itemsSummary || data.assetName || "—"}</strong></p>`}
          ${data.purpose ? `<p style="margin:12px 0 0;color:#475569;"><strong>Purpose:</strong> ${data.purpose}</p>` : ""}
          <p style="margin:12px 0 0;"><strong>Why:</strong> ${data.denialReason || "No reason was provided"}</p>
          ${data.approverName ? `<p style="margin:8px 0 0;color:#475569;">Reviewed by: ${data.approverName}</p>` : ""}
        </div>
        
        <p>If you have questions, or would like to send a new request, please contact the Stores &amp; Operations Team.</p>
        
        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/requests" class="button">
          View my requests
        </a>
        
        ${emailSignOff()}
      `;
      return baseTemplate(content, branding);
    },
  },

  ASSET_ISSUED: {
    subject: (data) => {
      const item = data.itemsSummary || data.assetName || "your item";
      return data.isConsumable
        ? `Issued to you: ${item}`
        : `Ready for pickup: ${item}`;
    },
    template: (data, branding) => {
      const item =
        data.itemsSummary || data.assetName || "the item you requested";
      const isConsumable = !!data.isConsumable;
      const content = `
        <h2 style="margin-top:0;color:#0f172a;">${
          isConsumable ? "Consumables issued to you" : "Ready for pickup"
        }</h2>
        <p>Dear ${data.requesterName || "Colleague"},</p>
        <p>${
          isConsumable
            ? "Your consumable request was approved and the following item(s) have been issued to you:"
            : "Your requested item is ready to collect from the store:"
        }</p>
        
        <div class="success-box">
          <p style="margin:0 0 8px;font-weight:600;color:#334155;">Item(s)</p>
          ${data.itemsListHtml || `<p style="margin:0;"><strong>${item}</strong></p>`}
          <p style="margin:12px 0 0;color:#475569;">${
            isConsumable ? "Issued by" : "Prepared by"
          }: ${data.issuerName || "Stores team"}</p>
          ${
            !isConsumable && data.expectedReturnDate
              ? `<p style="margin:8px 0 0;color:#475569;"><strong>Return by:</strong> ${formatEmailDate(data.expectedReturnDate)}</p>`
              : ""
          }
          ${data.issuanceNotes ? `<p style="margin:8px 0 0;color:#475569;"><strong>Note:</strong> ${data.issuanceNotes}</p>` : ""}
        </div>
        
        ${
          isConsumable
            ? `<p>Please collect from the store if you have not already, and contact the Stores &amp; Operations Team if anything is missing.</p>`
            : `<p><strong>Important:</strong> Please return the item(s) by the return date. Late returns may affect your future reimbursement.</p>`
        }
        
        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/requests" class="button">
          View my requests
        </a>
        
        ${emailSignOff()}
      `;
      return baseTemplate(content, branding);
    },
  },

  ASSET_ASSIGNED: {
    subject: "Asset Assigned - {assetName}",
    template: (data, branding) => {
      const content = `
        <h2>📋 Asset Assigned</h2>
        <p>Dear ${data.custodianName},</p>
        <p>You have been assigned as the custodian for the following asset:</p>
        
        <div class="success-box">
          <table class="details-table">
            <tr><th>Asset:</th><td>${data.assetName}</td></tr>
            <tr><th>Asset Tag:</th><td>${data.assetTag}</td></tr>
            <tr><th>Asset ID:</th><td>${data.assetId}</td></tr>
            <tr><th>Condition:</th><td>${data.currentCondition}</td></tr>
            <tr><th>Location:</th><td>${data.locationName}${data.roomOrArea ? ` - ${data.roomOrArea}` : ''}</td></tr>
            <tr><th>Assigned by:</th><td>${data.assignerName}</td></tr>
            <tr><th>Assignment Date:</th><td>${new Date(data.assignmentDate).toLocaleDateString()}</td></tr>
            ${data.notes ? `<tr><th>Notes:</th><td>${data.notes}</td></tr>` : ''}
          </table>
        </div>
        
        <p><strong>As the asset custodian, you are responsible for:</strong></p>
        <ul>
          <li>Ensuring the asset is properly maintained and secured</li>
          <li>Reporting any damage or issues immediately</li>
          <li>Following proper procedures for any maintenance or repairs</li>
          <li>Notifying the asset management team of any location changes</li>
        </ul>
        
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/assets" class="button">
          View Asset Details
        </a>
        
        <p>If you have any questions about your asset custodianship responsibilities, please contact the Asset Management team.</p>
        
        <p>Best regards,<br>${EMAIL_SIGNATURE}</p>
      `
      return baseTemplate(content, branding)
    }
  },

  RETURN_REMINDER: {
    subject: (data) =>
      data.daysUntilDue <= 0
        ? `Return reminder: please bring items back to the store`
        : `Return reminder: due in ${data.daysUntilDue} day${data.daysUntilDue !== 1 ? "s" : ""}`,
    template: (data, branding) => {
      const dueLabel =
        data.daysUntilDue <= 0
          ? "today"
          : `in ${data.daysUntilDue} day${data.daysUntilDue !== 1 ? "s" : ""}`;
      const content = `
        <h2>Return Reminder</h2>
        <p>Dear ${data.requesterName},</p>
        <p>This is a reminder that the item(s) you borrowed from the store are due for return <strong>${dueLabel}</strong>.</p>
        <p><strong>Please bring them back to the store</strong> so other staff can use them.</p>
        
        <div class="info-box">
          <table class="details-table">
            <tr><th>Item(s):</th><td>${data.assetName || data.itemsSummary || "Your borrowed items"}</td></tr>
            <tr><th>Request ID:</th><td>#${String(data.requestId || "").slice(-8)}</td></tr>
            <tr><th>Return Due:</th><td>${formatEmailDate(data.expectedReturnDate)}</td></tr>
          </table>
        </div>
        
        <p>Return the item(s) to the designated store / asset office as soon as possible.</p>
        
        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/requests" class="button">
          View My Requests
        </a>
        
        <p>Best regards,<br>${EMAIL_SIGNATURE}</p>
      `;
      return baseTemplate(content, branding);
    },
  },

  RETURN_OVERDUE: {
    subject: (data) =>
      `OVERDUE: please bring items back to the store (${data.daysOverdue || 0} day${(data.daysOverdue || 0) !== 1 ? "s" : ""} late)`,
    template: (data, branding) => {
      const content = `
        <h2>Overdue — Return to Store Required</h2>
        <p>Dear ${data.requesterName},</p>
        <p><strong>Your borrowed item(s) are overdue.</strong> Please bring them back to the store immediately.</p>
        
        <div class="warning-box">
          <table class="details-table">
            <tr><th>Item(s):</th><td>${data.assetName || data.itemsSummary || "Your borrowed items"}</td></tr>
            <tr><th>Request ID:</th><td>#${String(data.requestId || "").slice(-8)}</td></tr>
            <tr><th>Was Due:</th><td>${formatEmailDate(data.expectedReturnDate)}</td></tr>
            <tr><th>Days Overdue:</th><td>${data.daysOverdue} day${data.daysOverdue !== 1 ? "s" : ""}</td></tr>
          </table>
        </div>
        
        <p>Continued late returns may affect your ability to borrow items in the future. If you need an extension, contact the asset management team right away.</p>
        
        <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/requests" class="button">
          View My Requests
        </a>
        
        <p>Best regards,<br>${EMAIL_SIGNATURE}</p>
      `;
      return baseTemplate(content, branding);
    },
  },

  MAINTENANCE_DUE: {
    subject: "Asset Maintenance Required - ${assetName}",
    template: (data, branding) => {
      const content = `
        <h2>🔧 Maintenance Required</h2>
        <p>Dear ${data.technicianName},</p>
        <p>An asset requires scheduled maintenance attention.</p>
        
        <div class="warning-box">
          <table class="details-table">
            <tr><th>Asset:</th><td>${data.assetName}</td></tr>
            <tr><th>Asset ID:</th><td>${data.assetId}</td></tr>
            <tr><th>Last Maintenance:</th><td>${data.lastMaintenance ? new Date(data.lastMaintenance).toLocaleDateString() : 'Never'}</td></tr>
            <tr><th>Due Date:</th><td>${new Date(data.nextMaintenance).toLocaleDateString()}</td></tr>
          </table>
        </div>
        
        <p>Please schedule and perform the required maintenance as soon as possible.</p>
        
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/assets/${data.assetId}" class="button">
          View Asset Details
        </a>
        
        <p>Best regards,<br>${EMAIL_SIGNATURE}</p>
      `
      return baseTemplate(content, branding)
    }
  },

  ASSET_RETURNED: {
    subject: "Asset Returned - {requestId}",
    template: (data, branding) => {
      const content = `
        <h2>📦 Asset Returned</h2>
        <p>Dear Admin,</p>
        <p>An asset has been returned and requires processing.</p>
        
        <div class="info-box">
          <table class="details-table">
            <tr><th>Asset:</th><td>${data.assetName}</td></tr>
            <tr><th>Request ID:</th><td>#${data.requestId}</td></tr>
            <tr><th>Returned by:</th><td>${data.requesterName}</td></tr>
            <tr><th>Return Date:</th><td>${new Date(data.returnDate).toLocaleDateString()}</td></tr>
            <tr><th>Condition:</th><td>${data.returnCondition}</td></tr>
            ${data.returnNotes ? `<tr><th>Notes:</th><td>${data.returnNotes}</td></tr>` : ''}
          </table>
        </div>
        
        <p>Please process this return in the admin panel and update the asset status accordingly.</p>
        
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/requests" class="button">
          Process Return
        </a>
        
        <p>Best regards,<br>${EMAIL_SIGNATURE}</p>
      `
      return baseTemplate(content, branding)
    }
  },

  SYSTEM_ALERT: {
    subject: "System Alert - ${alertType}",
    template: (data, branding) => {
      const content = `
        <h2>🚨 System Alert</h2>
        <p>Dear Administrator,</p>
        <p>A system alert has been triggered that requires your attention.</p>
        
        <div class="warning-box">
          <table class="details-table">
            <tr><th>Alert Type:</th><td>${data.alertType}</td></tr>
            <tr><th>Severity:</th><td>${data.severity}</td></tr>
            <tr><th>Timestamp:</th><td>${new Date().toLocaleString()}</td></tr>
            ${data.details ? `<tr><th>Details:</th><td>${data.details}</td></tr>` : ''}
          </table>
        </div>
        
        <p>Please investigate this alert and take appropriate action.</p>
        
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/dashboard" class="button">
          View Admin Dashboard
        </a>
        
        <p>Best regards,<br>${EMAIL_SIGNATURE}</p>
      `
      return baseTemplate(content, branding)
    }
  },

  PASSWORD_RESET: {
    subject: (data, branding) =>
      `Reset your ${branding.orgName || "Asset Management"} password`,
    template: (data, branding) => {
      const orgName =
        branding.orgName || "Renewable Energy Training Center (RETC)";
      const expires = data.expiresInMinutes || 60;
      const resetUrl = data.resetUrl || "#";
      const content = `
        <h2>Password reset request</h2>
        <p>Dear ${data.userName || "there"},</p>
        <p>We received a request to reset the password for your ${orgName} account${
          data.userEmail ? ` (<strong>${data.userEmail}</strong>)` : ""
        }.</p>

        <div class="info-box">
          <p style="margin:0;">Click the button below to choose a new password. This link expires in <strong>${expires} minutes</strong>.</p>
        </div>

        <p style="text-align:center;">
          <a href="${resetUrl}" class="button">Reset password</a>
        </p>

        <p style="font-size:13px;color:#6b7280;word-break:break-all;">
          If the button does not work, copy and paste this link into your browser:<br>
          ${resetUrl}
        </p>

        <div class="warning-box">
          <p style="margin:0;"><strong>Didn't request this?</strong> You can ignore this email — your password will stay the same.</p>
        </div>

        ${emailSignOff()}
      `;
      return baseTemplate(content, branding);
    },
  },

  USER_WELCOME: {
    subject: "Welcome to {orgName} - Your Account is Ready!",
    template: (data, branding) => {
      const orgName =
        branding.orgName || "Renewable Energy Training Center (RETC)"
      const content = `
        <h2>🎉 Welcome to ${orgName}!</h2>
        <p>Dear ${data.userName},</p>
        <p>Welcome to the ${orgName} system! Your account has been successfully created and you can now access the platform.</p>
        
        <div class="success-box">
          <table class="details-table">
            <tr><th>Name:</th><td>${data.userName}</td></tr>
            <tr><th>Email:</th><td>${data.userEmail}</td></tr>
            <tr><th>User ID:</th><td>${data.userId}</td></tr>
            <tr><th>Role${data.roles && data.roles.length > 1 ? 's' : ''}:</th><td>${data.roles ? data.roles.join(', ') : 'Staff'}</td></tr>
            ${data.department ? `<tr><th>Department:</th><td>${data.department}</td></tr>` : ''}
          </table>
        </div>
        
        <div class="warning-box">
          <h3>🔐 Your Login Credentials</h3>
          <p><strong>Email:</strong> ${data.userEmail}</p>
          <p><strong>Temporary Password:</strong> <code style="background-color: #f3f4f6; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${data.temporaryPassword}</code></p>
          <p><strong>⚠️ Important:</strong> Please change your password after your first login for security purposes.</p>
        </div>
        
        <h3>🚀 Getting Started</h3>
        <ul>
          <li><strong>Asset Requests:</strong> Submit requests for equipment and resources</li>
          <li><strong>Track Assets:</strong> Monitor your assigned assets and returns</li>
          <li><strong>Profile Management:</strong> Update your contact information and preferences</li>
          ${data.roles && data.roles.includes('ADMIN') ? '<li><strong>Administration:</strong> Manage users, assets, and system settings</li>' : ''}
        </ul>
        
        <p>Click the button below to log in to your account:</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login" class="button">
          Log In to Your Account
        </a>
        
        <p>If you have any questions or need assistance, please don't hesitate to contact our support team.</p>
        
        <p>Welcome aboard!<br>
        The ${orgName} Team</p>
      `
      return baseTemplate(content, branding)
    }
  }
}

/**
 * Template renderer function
 */
export function renderEmailTemplate(templateType, data, branding = {}) {
  const template = EMAIL_TEMPLATES[templateType]
  
  if (!template) {
    throw new Error(`Email template '${templateType}' not found`)
  }

  const htmlContent = template.template(data, branding)
  let subject =
    typeof template.subject === "function"
      ? template.subject(data, branding)
      : template.subject

  // Replace placeholders in subject (string templates only)
  if (typeof subject === "string") {
    subject = subject.replace(/{(\w+)}/g, (match, key) => data[key] || branding[key] || match)
    subject = subject.replace(/\${(\w+)}/g, (match, key) => data[key] || branding[key] || match)
  }

  return {
    subject,
    html: htmlContent
  }
}