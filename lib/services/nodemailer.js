import nodemailer from 'nodemailer'

// Read SMTP settings, supporting both the current EMAIL_* names (as set in .env)
// and the legacy SMTP_* names as a fallback. No .env changes required.
const getEmailEnv = () => {
  const port = process.env.EMAIL_PORT || process.env.SMTP_PORT || '587'
  const secureFlag = process.env.EMAIL_SECURE || process.env.SMTP_SECURE
  // Port 465 always uses implicit SSL; otherwise honor the explicit flag.
  const secure =
    String(port) === '465' ? true : secureFlag === 'true'

  return {
    host: process.env.EMAIL_HOST || process.env.SMTP_HOST,
    port,
    user: process.env.EMAIL_USER || process.env.SMTP_USER,
    pass: process.env.EMAIL_PASSWORD || process.env.SMTP_PASS,
    secure,
    from: process.env.EMAIL_FROM,
    fromName: process.env.EMAIL_FROM_NAME,
  }
}

// Build the "From" header. EMAIL_FROM may already be "Name <email>", in which
// case we use it as-is; otherwise combine with EMAIL_FROM_NAME when present.
const buildFromHeader = () => {
  const { from, fromName } = getEmailEnv()
  if (!from) return undefined
  if (from.includes('<')) return from
  return fromName ? `${fromName} <${from}>` : from
}

const getEmailConfigState = () => {
  const env = getEmailEnv()
  const required = { host: env.host, port: env.port, user: env.user, pass: env.pass, from: env.from }
  const missing = Object.entries(required)
    .filter(([, value]) => !value || String(value).trim() === '')
    .map(([key]) => key)

  return {
    configured: missing.length === 0,
    missing,
  }
}

// Create reusable transporter object using SMTP transport
const createTransporter = () => {
  const { configured, missing } = getEmailConfigState()
  if (!configured) {
    console.warn(
      'Email notifications are disabled because SMTP configuration is incomplete. Missing:',
      missing.join(', ')
    )
    return null
  }

  const env = getEmailEnv()
  const config = {
    host: env.host,
    port: parseInt(env.port || '587'),
    secure: env.secure, // true for 465, false for other ports
    auth: {
      user: env.user,
      pass: env.pass,
    },
    // Additional options for better compatibility
    tls: {
      // Do not fail on invalid certs
      rejectUnauthorized: false
    },
    debug: process.env.NODE_ENV === 'development',
    logger: process.env.NODE_ENV === 'development'
  }

  console.log('SMTP Configuration:', {
    host: config.host,
    port: config.port,
    secure: config.secure,
    user: config.auth.user
  })

  return nodemailer.createTransport(config)
}

// Email template generator
const generateEmailTemplate = (type, data) => {
  const templates = {
    request_submitted: {
      subject: `New Asset Request: ${data.assetName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
            <h1>RETC Asset Management</h1>
          </div>
          <div style="padding: 20px;">
            <h2>New Asset Request Submitted</h2>
            <p><strong>${data.requesterName}</strong> has submitted a request for:</p>
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Asset:</strong> ${data.assetName}</p>
              <p><strong>Request ID:</strong> ${data.requestId}</p>
              <p><strong>Purpose:</strong> ${data.purpose}</p>
              <p><strong>Expected Return:</strong> ${new Date(data.expectedReturnDate).toLocaleDateString()}</p>
            </div>
            <p>Please review and approve this request in the admin panel.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/requests" 
                 style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Review Request
              </a>
            </div>
          </div>
        </div>
      `,
    },
    
    request_approved: {
      subject: `Asset Request Approved: ${data.assetName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #16a34a; color: white; padding: 20px; text-align: center;">
            <h1>RETC Asset Management</h1>
          </div>
          <div style="padding: 20px;">
            <h2>🎉 Request Approved!</h2>
            <p>Hi <strong>${data.requesterName}</strong>,</p>
            <p>Great news! Your asset request has been approved by <strong>${data.approverName}</strong>.</p>
            <div style="background: #f0f9f0; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
              <p><strong>Asset:</strong> ${data.assetName}</p>
              <p><strong>Request ID:</strong> ${data.requestId}</p>
              ${data.approvalNotes ? `<p><strong>Notes:</strong> ${data.approvalNotes}</p>` : ''}
            </div>
            <p>You will receive another notification once the asset is ready for pickup.</p>
          </div>
        </div>
      `,
    },
    
    request_denied: {
      subject: `Asset Request Denied: ${data.assetName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
            <h1>RETC Asset Management</h1>
          </div>
          <div style="padding: 20px;">
            <h2>Request Update</h2>
            <p>Hi <strong>${data.requesterName}</strong>,</p>
            <p>Unfortunately, your asset request has been denied by <strong>${data.approverName}</strong>.</p>
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
              <p><strong>Asset:</strong> ${data.assetName}</p>
              <p><strong>Request ID:</strong> ${data.requestId}</p>
              ${data.denialReason ? `<p><strong>Reason:</strong> ${data.denialReason}</p>` : ''}
            </div>
            <p>If you have questions about this decision, please contact your administrator.</p>
          </div>
        </div>
      `,
    },
    
    asset_issued: {
      subject: `Asset Ready for Pickup: ${data.assetName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #2563eb; color: white; padding: 20px; text-align: center;">
            <h1>RETC Asset Management</h1>
          </div>
          <div style="padding: 20px;">
            <h2>🚀 Asset Ready for Pickup!</h2>
            <p>Hi <strong>${data.requesterName}</strong>,</p>
            <p>Your requested asset is now ready for pickup. It has been issued by <strong>${data.issuerName}</strong>.</p>
            <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
              <p><strong>Asset:</strong> ${data.assetName}</p>
              <p><strong>Request ID:</strong> ${data.requestId}</p>
              <p><strong>Expected Return:</strong> ${new Date(data.expectedReturnDate).toLocaleDateString()}</p>
              ${data.issuanceNotes ? `<p><strong>Notes:</strong> ${data.issuanceNotes}</p>` : ''}
            </div>
            <p><strong>Important:</strong> Please ensure you return the asset by the expected return date to avoid any issues.</p>
          </div>
        </div>
      `,
    },
    
    return_reminder: {
      subject: `Return Reminder: ${data.assetName} due soon`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f59e0b; color: white; padding: 20px; text-align: center;">
            <h1>RETC Asset Management</h1>
          </div>
          <div style="padding: 20px;">
            <h2>⏰ Return Reminder</h2>
            <p>Hi <strong>${data.requesterName}</strong>,</p>
            <p>This is a friendly reminder that your borrowed asset is due for return soon.</p>
            <div style="background: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
              <p><strong>Asset:</strong> ${data.assetName}</p>
              <p><strong>Request ID:</strong> ${data.requestId}</p>
              <p><strong>Due Date:</strong> ${new Date(data.expectedReturnDate).toLocaleDateString()}</p>
              <p><strong>Days Until Due:</strong> ${data.daysUntilDue}</p>
            </div>
            <p>Please prepare to return the asset by the due date. Contact an administrator if you need an extension.</p>
          </div>
        </div>
      `,
    },
    
    return_overdue: {
      subject: `OVERDUE: Please return ${data.assetName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
            <h1>RETC Asset Management</h1>
          </div>
          <div style="padding: 20px;">
            <h2>🚨 Asset Return OVERDUE</h2>
            <p>Hi <strong>${data.requesterName}</strong>,</p>
            <p><strong>URGENT:</strong> Your borrowed asset is now overdue for return.</p>
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
              <p><strong>Asset:</strong> ${data.assetName}</p>
              <p><strong>Request ID:</strong> ${data.requestId}</p>
              <p><strong>Was Due:</strong> ${new Date(data.expectedReturnDate).toLocaleDateString()}</p>
              <p><strong>Days Overdue:</strong> ${data.daysOverdue}</p>
            </div>
            <p>Please return this asset immediately or contact an administrator to discuss an extension.</p>
          </div>
        </div>
      `,
    }
  }
  
  return templates[type] || {
    subject: 'RETC Asset Management Notification',
    html: '<p>You have received a notification from RETC Asset Management.</p>'
  }
}

// Main email service class
export class NodemailerService {
  static async sendEmail({ to, subject, html, text }) {
    try {
      const transporter = createTransporter()
      if (!transporter) {
        return {
          skipped: true,
          reason: 'smtp_not_configured',
          messageId: 'email-sending-skipped'
        }
      }

      const mailOptions = {
        from: buildFromHeader(),
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, '') // Strip HTML for text version
      }
      
      const result = await transporter.sendMail(mailOptions)
      console.log('Email sent successfully:', result.messageId)
      return result
    } catch (error) {
      console.error('Error sending email:', error)
      throw error
    }
  }
  
  static async sendNotification(type, recipients, data, renderedEmail = null) {
    try {
      // Use rendered template if provided, otherwise use legacy templates
      const template = renderedEmail || generateEmailTemplate(type, data)
      
      // Handle special recipient types
      let emailAddresses = []
      if (recipients === 'admins') {
        // In a real implementation, you would fetch admin email addresses
        // For now, we'll use the system admin email
        emailAddresses = [process.env.EMAIL_FROM]
      } else if (Array.isArray(recipients)) {
        emailAddresses = recipients
      } else {
        emailAddresses = [recipients]
      }
      
      const result = await this.sendEmail({
        to: emailAddresses,
        subject: template.subject,
        html: template.html
      })
      
      return result
    } catch (error) {
      console.error('Error sending notification:', error)
      throw error
    }
  }
  
  // Specific notification methods
  static async sendRequestSubmitted(request, requester, asset) {
    const data = {
      requesterName: requester.name,
      assetName: asset.name,
      requestId: request.$id,
      purpose: request.purpose,
      expectedReturnDate: request.expectedReturnDate,
    }
    
    return this.sendNotification('request_submitted', 'admins', data)
  }
  
  static async sendRequestApproved(request, requester, asset, approver) {
    const data = {
      requesterName: requester.name,
      assetName: asset.name,
      requestId: request.$id,
      approverName: approver.name,
      approvalNotes: request.approvalNotes,
    }
    
    return this.sendNotification('request_approved', requester.email, data)
  }
  
  static async sendRequestDenied(request, requester, asset, approver) {
    const data = {
      requesterName: requester.name,
      assetName: asset.name,
      requestId: request.$id,
      approverName: approver.name,
      denialReason: request.approvalNotes,
    }
    
    return this.sendNotification('request_denied', requester.email, data)
  }
  
  static async sendAssetIssued(request, requester, asset, issuer) {
    const data = {
      requesterName: requester.name,
      assetName: asset.name,
      requestId: request.$id,
      issuerName: issuer.name,
      expectedReturnDate: request.expectedReturnDate,
      issuanceNotes: request.issuanceNotes,
    }
    
    return this.sendNotification('asset_issued', requester.email, data)
  }
  
  static async sendReturnReminder(request, requester, asset) {
    const data = {
      requesterName: requester.name,
      assetName: asset.name,
      requestId: request.$id,
      expectedReturnDate: request.expectedReturnDate,
      daysUntilDue: Math.ceil((new Date(request.expectedReturnDate) - new Date()) / (1000 * 60 * 60 * 24)),
    }
    
    return this.sendNotification('return_reminder', requester.email, data)
  }
  
  static async sendReturnOverdue(request, requester, asset) {
    const data = {
      requesterName: requester.name,
      assetName: asset.name,
      requestId: request.$id,
      expectedReturnDate: request.expectedReturnDate,
      daysOverdue: Math.ceil((new Date() - new Date(request.expectedReturnDate)) / (1000 * 60 * 60 * 24)),
    }
    
    // Send to both requester and admins
    await this.sendNotification('return_overdue', requester.email, data)
    return this.sendNotification('return_overdue', 'admins', data)
  }
}