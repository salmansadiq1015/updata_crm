import ejs from "ejs";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Create Transporter ──────────────────────────────────────
const createTransporter = () => {
  if (!process.env.SMTP_MAIL || !process.env.SMTP_PASSWORD) {
    throw new Error(
      "SMTP configuration is missing. Please check environment variables."
    );
  }

  const config = {
    auth: {
      user: process.env.SMTP_MAIL,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: { rejectUnauthorized: false },
  };

  // If a service (e.g. "gmail") is set, it auto-configures host/port
  if (process.env.SMTP_SERVICE) {
    config.service = process.env.SMTP_SERVICE;
  } else {
    config.host = process.env.SMTP_HOST;
    config.port = parseInt(process.env.SMTP_PORT, 10) || 587;
    config.secure = config.port === 465;
  }

  return nodemailer.createTransport(config);
};

// ─── Core Send Mail ──────────────────────────────────────────

/**
 * Send an email with EJS template rendering.
 *
 * @param {Object} options
 * @param {string} options.email     - Recipient email address
 * @param {string} options.subject   - Email subject line
 * @param {string} options.template  - Template filename (e.g., "resetPassword.ejs")
 * @param {Object} options.data      - Data passed to the EJS template
 * @param {string} [options.fromName="MB Boiler"] - Sender display name
 * @param {Array}  [options.attachments] - Nodemailer attachments array
 * @returns {Promise<Object>} Nodemailer info object
 */
const sendMail = async (options) => {
  try {
    const {
      email,
      subject,
      template,
      data = {},
      fromName = "MB Boiler",
      attachments,
    } = options;

    if (!email || !subject || !template) {
      throw new Error(
        `Missing required email parameters: email=${!!email}, subject=${!!subject}, template=${!!template}`
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error(`Invalid email address: ${email}`);
    }

    const templatePath = join(__dirname, "../mails", template);

    if (!fs.existsSync(templatePath)) {
      throw new Error(`Email template not found: ${templatePath}`);
    }

    // Render template with common variables
    const html = await ejs.renderFile(templatePath, {
      ...data,
      appName: "MB Boiler",
      supportEmail: process.env.SUPPORT_EMAIL || "installation@bolliger-heizungen.ch",
      clientUrl: process.env.CLIENT_URI || "http://localhost:3000",
      year: new Date().getFullYear(),
    });

    const transporter = createTransporter();

    const message = {
      from: `${fromName} <${process.env.SMTP_MAIL}>`,
      to: email,
      subject,
      html,
    };

    if (attachments) message.attachments = attachments;

    const info = await transporter.sendMail(message);
    console.log(`Email sent to ${email}: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error("Error sending email:", error.message);
    console.error("Email details:", {
      to: options.email,
      subject: options.subject,
      template: options.template,
    });
    throw error;
  }
};

export default sendMail;

const escapeHtml = (value = "") => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

// ─── Convenience Functions ───────────────────────────────────

/**
 * Send password reset email.
 */
export const sendPasswordResetEmail = async (email, name, resetUrl) => {
  return sendMail({
    email,
    subject: "Password Reset Request - MB Boiler",
    template: "resetPassword.ejs",
    data: { name, resetUrl },
  });
};

/**
 * Send welcome email with temporary credentials.
 */
export const sendWelcomeEmail = async (email, name, tempPassword) => {
  return sendMail({
    email,
    subject: "Welcome to MB Boiler - Your Account Details",
    template: "welcome.ejs",
    data: { name, tempPassword, loginUrl: `${process.env.CLIENT_URI || "http://localhost:3000"}/login` },
  });
};

/**
 * Send account activation email with setup link.
 */
export const sendActivationEmail = async (email, name, activationUrl) => {
  return sendMail({
    email,
    subject: "Activate Your Account - MB Boiler",
    template: "accountActivation.ejs",
    data: { name, activationUrl },
  });
};

/**
 * Send password changed notification.
 */
export const sendPasswordChangedEmail = async (email, name) => {
  return sendMail({
    email,
    subject: "Password Changed - MB Boiler",
    template: "passwordChanged.ejs",
    data: { name },
  });
};

/**
 * Send invoice email to customer with optional PDF attachment.
 */
export const sendInvoiceEmail = async (email, invoiceData, pdfAttachment = null) => {
  const options = {
    email,
    subject: `Invoice ${invoiceData.invoiceNumber} - MB Boiler`,
    template: "invoiceEmail.ejs",
    data: {
      invoiceNumber: invoiceData.invoiceNumber,
      customerName: invoiceData.customerName,
      invoiceDate: invoiceData.invoiceDate,
      dueDate: invoiceData.dueDate,
      subtotal: invoiceData.subtotal,
      taxRate: invoiceData.taxRate,
      taxAmount: invoiceData.taxAmount,
      total: invoiceData.total,
      currency: invoiceData.currency || "CHF",
      paymentTerms: invoiceData.paymentTerms,
      notes: invoiceData.notes || "",
    },
  };

  if (pdfAttachment) {
    options.attachments = [
      {
        filename: `Invoice_${invoiceData.invoiceNumber}.pdf`,
        content: pdfAttachment,
      },
    ];
  }

  return sendMail(options);
};

/**
 * Send report rejection notification to technician.
 */
export const sendReportRejectedEmail = async (email, data) => {
  return sendMail({
    email,
    subject: `Report ${data.reportNumber} Requires Revision - MB Boiler`,
    template: "reportRejected.ejs",
    data: {
      technicianName: data.technicianName,
      reportNumber: data.reportNumber,
      orderNumber: data.orderNumber,
      customerName: data.customerName,
      reviewerName: data.reviewerName,
      rejectionReason: data.rejectionReason,
      reportId: data.reportId,
    },
  });
};

/**
 * Send order assignment notification to technician.
 */
export const sendOrderAssignedEmail = async (email, data) => {
  return sendMail({
    email,
    subject: `New Order Assigned: ${data.orderNumber} - MB Boiler`,
    template: "orderAssigned.ejs",
    data: {
      technicianName: data.technicianName,
      orderNumber: data.orderNumber,
      customerName: data.customerName,
      orderType: data.orderType,
      priority: data.priority,
      scheduledDate: data.scheduledDate || "",
      timeWindow: data.timeWindow || "",
      serviceAddress: data.serviceAddress || "",
      description: data.description || "",
      orderId: data.orderId,
    },
  });
};

/**
 * Send subscription expiry reminder to admin.
 */
export const sendSubscriptionReminderEmail = async (email, data) => {
  return sendMail({
    email,
    subject: `Subscription Expiring: ${data.customerName} - MB Boiler`,
    template: "subscriptionReminder.ejs",
    data: {
      customerName: data.customerName,
      subscriptionType: data.subscriptionType,
      subscriptionName: data.subscriptionName || "",
      startDate: data.startDate,
      endDate: data.endDate,
      price: data.price,
      currency: data.currency || "CHF",
      daysRemaining: data.daysRemaining,
      subscriptionId: data.subscriptionId,
    },
  });
};

/**
 * Send partner appointment confirmation email.
 */
export const sendPartnerConfirmationEmail = async (email, data, pdfAttachment = null) => {
  const options = {
    email,
    subject: `Terminbestaetigung: ${data.projectName} - ${data.entryName} - MB Boiler`,
    template: "partnerAppointmentConfirmation.ejs",
    data: {
      partnerName: data.partnerName,
      projectName: data.projectName,
      projectNumber: data.projectNumber,
      entryName: data.entryName,
      startDate: data.startDate,
      endDate: data.endDate || "",
      siteAddress: data.siteAddress || "",
      contactPerson: data.contactPerson || "",
      notes: data.notes || "",
      confirmationUrl: data.confirmationUrl || "",
    },
  };
  if (pdfAttachment) {
    options.attachments = [{
      filename: `Terminbestaetigung_${data.projectNumber}.pdf`,
      content: pdfAttachment,
    }];
  }
  return sendMail(options);
};

/**
 * Send project status change notification.
 */
export const sendProjectStatusNotification = async (email, data) => {
  return sendMail({
    email,
    subject: `Projektstatus geaendert: ${data.projectName} - MB Boiler`,
    template: "projectStatusNotification.ejs",
    data: {
      recipientName: data.recipientName,
      projectName: data.projectName,
      projectNumber: data.projectNumber,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      changedBy: data.changedBy,
      comment: data.comment || "",
      projectUrl: data.projectUrl || "",
    },
  });
};

/**
 * Send customer appointment confirmation.
 */
export const sendAppointmentConfirmationEmail = async (email, data) => {
  return sendMail({
    email,
    subject: `Terminbestaetigung: ${data.appointmentDate} - MB Boiler`,
    template: "appointmentConfirmation.ejs",
    data: {
      customerName: data.customerName,
      appointmentDate: data.appointmentDate,
      appointmentWindow: data.appointmentWindow || "",
      technicianName: data.technicianName || "",
      serviceAddress: data.serviceAddress || "",
      assignmentType: data.assignmentType || "",
      instructions: data.instructions || "",
      contactPhone: data.contactPhone || "",
    },
  });
};

/**
 * Send customer appointment reminder (24h before).
 */
export const sendAppointmentReminderEmail = async (email, data) => {
  return sendMail({
    email,
    subject: `Terminerinnerung morgen: ${data.appointmentDate} - MB Boiler`,
    template: "appointmentReminder.ejs",
    data: {
      customerName: data.customerName,
      appointmentDate: data.appointmentDate,
      appointmentWindow: data.appointmentWindow || "",
      technicianName: data.technicianName || "",
      serviceAddress: data.serviceAddress || "",
      contactPhone: data.contactPhone || "",
    },
  });
};

/**
 * Send customer appointment cancellation.
 */
export const sendAppointmentCancellationEmail = async (email, data) => {
  return sendMail({
    email,
    subject: `Termin storniert: ${data.appointmentDate || "MB Boiler"}`,
    template: "notificationGeneric.ejs",
    data: {
      recipientName: data.customerName,
      title: "Termin storniert",
      body: [
        "<p>Ihr Termin wurde storniert.</p>",
        data.reason ? `<p><strong>Grund:</strong> ${escapeHtml(data.reason)}</p>` : "",
        data.appointmentDate ? `<p><strong>Datum:</strong> ${escapeHtml(data.appointmentDate)}</p>` : "",
        data.appointmentWindow ? `<p><strong>Zeitfenster:</strong> ${escapeHtml(data.appointmentWindow)}</p>` : "",
      ].filter(Boolean).join(""),
      deepLink: "",
    },
  });
};

/**
 * Send customer appointment reschedule notification.
 */
export const sendAppointmentRescheduledEmail = async (email, data) => {
  return sendMail({
    email,
    subject: `Termin neu geplant: ${data.appointmentDate || "MB Boiler"}`,
    template: "notificationGeneric.ejs",
    data: {
      recipientName: data.customerName,
      title: "Termin neu geplant",
      body: [
        "<p>Ihr Termin wurde neu geplant.</p>",
        data.appointmentDate ? `<p><strong>Neues Datum:</strong> ${escapeHtml(data.appointmentDate)}</p>` : "",
        data.appointmentWindow ? `<p><strong>Zeitfenster:</strong> ${escapeHtml(data.appointmentWindow)}</p>` : "",
        data.technicianName ? `<p><strong>Techniker:</strong> ${escapeHtml(data.technicianName)}</p>` : "",
        data.serviceAddress ? `<p><strong>Adresse:</strong> ${escapeHtml(data.serviceAddress)}</p>` : "",
      ].filter(Boolean).join(""),
      deepLink: "",
    },
  });
};

/**
 * Send assignment notification to technician.
 */
export const sendAssignmentNotificationEmail = async (email, data) => {
  return sendMail({
    email,
    subject: `Neuer Einsatz: ${data.assignmentNumber} - MB Boiler`,
    template: "assignmentNotification.ejs",
    data: {
      technicianName: data.technicianName,
      assignmentNumber: data.assignmentNumber,
      assignmentType: data.assignmentType,
      title: data.title || "",
      startDatetime: data.startDatetime,
      endDatetime: data.endDatetime,
      customerName: data.customerName || "",
      siteAddress: data.siteAddress || "",
      instructions: data.instructions || "",
      priority: data.priority || "NORMAL",
    },
  });
};

/**
 * Send work report submitted notification to back office.
 */
export const sendReportSubmittedEmail = async (email, data) => {
  return sendMail({
    email,
    subject: `Arbeitsbericht eingereicht: ${data.reportNumber} - MB Boiler`,
    template: "reportSubmitted.ejs",
    data: {
      recipientName: data.recipientName,
      technicianName: data.technicianName,
      reportNumber: data.reportNumber,
      orderNumber: data.orderNumber,
      customerName: data.customerName || "",
      reportDate: data.reportDate,
      workPerformed: data.workPerformed,
      followUpNeeded: data.followUpNeeded || false,
      reportId: data.reportId,
    },
  });
};

/**
 * Send quotation to customer.
 */
export const sendQuotationEmail = async (email, data, pdfAttachment = null) => {
  const options = {
    email,
    subject: `Offerte ${data.quotationNumber} - MB Boiler`,
    template: "quotationSent.ejs",
    data: {
      customerName: data.customerName,
      quotationNumber: data.quotationNumber,
      title: data.title || "",
      quotationDate: data.quotationDate,
      validUntil: data.validUntil,
      currency: data.currency || "CHF",
      grandTotal: data.grandTotal,
      salesPersonName: data.salesPersonName || "MB Boiler Team",
    },
  };
  if (pdfAttachment) {
    options.attachments = [{ filename: `Offerte_${data.quotationNumber}.pdf`, content: pdfAttachment }];
  }
  return sendMail(options);
};

/**
 * Send order confirmation to customer.
 */
export const sendOrderConfirmationQopEmail = async (email, data, pdfAttachment = null) => {
  const options = {
    email,
    subject: `Auftragsbestaetigung ${data.orderNumber} - MB Boiler`,
    template: "orderConfirmation.ejs",
    data: {
      customerName: data.customerName,
      orderNumber: data.orderNumber,
      title: data.title || "",
      sourceQuotationNumber: data.sourceQuotationNumber || "",
      currency: data.currency || "CHF",
      grandTotal: data.grandTotal,
      requestedDate: data.requestedDate || "",
    },
  };
  if (pdfAttachment) {
    options.attachments = [{ filename: `Auftragsbestaetigung_${data.orderNumber}.pdf`, content: pdfAttachment }];
  }
  return sendMail(options);
};

/**
 * Send invoice to customer.
 */
export const sendInvoiceSentEmail = async (email, data, pdfAttachment = null) => {
  const options = {
    email,
    subject: `Rechnung ${data.invoiceNumber} - MB Boiler`,
    template: "invoiceSent.ejs",
    data: {
      customerName: data.customerName,
      invoiceNumber: data.invoiceNumber,
      invoiceDate: data.invoiceDate,
      dueDate: data.dueDate,
      currency: data.currency || "CHF",
      amountDue: data.amountDue,
      paymentTermsText: data.paymentTermsText || "",
    },
  };
  if (pdfAttachment) {
    options.attachments = [{
      filename: pdfAttachment.filename || `Rechnung_${data.invoiceNumber}.pdf`,
      content: pdfAttachment.content || pdfAttachment,
      contentType: pdfAttachment.contentType || 'application/pdf',
    }];
  }
  return sendMail(options);
};

/**
 * Send appointment reminder (WhatsApp/Email fallback).
 */
export const sendQopAppointmentReminderEmail = async (email, data) => {
  return sendMail({
    email,
    subject: `Terminerinnerung: ${data.appointmentDate} - MB Boiler`,
    template: "appointmentReminderWhatsapp.ejs",
    data: {
      customerName: data.customerName,
      appointmentDate: data.appointmentDate,
      appointmentTime: data.appointmentTime || "",
      technicianName: data.technicianName || "",
      serviceDescription: data.serviceDescription || "",
      siteAddress: data.siteAddress || "",
      contactPhone: data.contactPhone || "",
    },
  });
};

/**
 * Send task assigned notification.
 */
export const sendTaskAssignedEmail = async (email, data) => {
  return sendMail({
    email,
    subject: `Neue Aufgabe zugewiesen: ${data.taskTitle} - MB Boiler`,
    template: "taskAssigned.ejs",
    data: {
      assigneeName: data.assigneeName,
      assignerName: data.assignerName,
      taskTitle: data.taskTitle,
      taskId: data.taskId,
      dueDate: data.dueDate || null,
      priority: data.priority || "NONE",
    },
  });
};

/**
 * Send a generated project document to a recipient with a PDF attachment.
 * Used by the PM "Email document" action (PROJ-005 AC-5).
 *
 * @param {string} email
 * @param {Object} data - { projectName, projectNumber, fileName, message }
 * @param {Object|Buffer|null} pdfAttachment - { filename, content, contentType } or raw Buffer
 */
export const sendProjectDocumentEmail = async (email, data, pdfAttachment = null) => {
  const options = {
    email,
    subject: `Dokument: ${data.projectName || data.fileName} - MB Boiler`,
    template: "projectDocument.ejs",
    data: {
      projectName: data.projectName || "",
      projectNumber: data.projectNumber || "",
      fileName: data.fileName || "",
      message: data.message || "",
    },
  };
  if (pdfAttachment) {
    options.attachments = [{
      filename: pdfAttachment.filename || data.fileName || "Dokument.pdf",
      content: pdfAttachment.content || pdfAttachment,
      contentType: pdfAttachment.contentType || "application/pdf",
    }];
  }
  return sendMail(options);
};

/**
 * Send task reminder notification.
 */
export const sendTaskReminderEmail = async (email, data) => {
  return sendMail({
    email,
    subject: `${data.isOverdue ? 'Überfällige Aufgabe' : 'Aufgabenerinnerung'}: ${data.taskTitle} - MB Boiler`,
    template: "taskReminder.ejs",
    data: {
      userName: data.userName,
      taskTitle: data.taskTitle,
      taskId: data.taskId,
      dueDate: data.dueDate || null,
      isOverdue: data.isOverdue || false,
    },
  });
};
