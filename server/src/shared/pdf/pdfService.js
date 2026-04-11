/* eslint-disable no-undef, no-async-promise-executor, no-unused-vars */
// Legacy file — not used by current module architecture.
// Dependencies lazy-loaded to avoid import errors.
// import PDFDocument from "pdfkit";
import { PutObjectCommand } from "@aws-sdk/client-s3";
// import { s3 } from "../middleware/uploadMiddleware.js";
import dotenv from "dotenv";
// Note: Install qrcode package: npm install qrcode
// import QRCode from "qrcode";

dotenv.config();

const BUCKET = process.env.AWS_S3_BUCKET_NAME;
const REGION = "eu-north-1";

// ─── Company Info ────────────────────────────────────────────
const COMPANY = {
  name: "Bolliger Heizungen Sanitär GmbH",
  street: "Buchenstrasse 57B",
  city: "4142 Münchenstein",
  country: "Schweiz",
  phone: "+41 61 301 26 70",
  email: "installation@bolliger-heizungen.ch",
  // Swiss bank account details (update with actual account)
  iban: "CH44-3199-9123-0008-8901-2",
  account: "CH44-3199-9123-0008-8901-2",
};

// ─── Colors ──────────────────────────────────────────────────
const PRIMARY = "#dc2626";
const DARK = "#0a0a0a";
const MUTED = "#6b7280";
const BORDER = "#e5e7eb";

// ─── Helpers ─────────────────────────────────────────────────
const fmt = (num) => Number(num || 0).toFixed(2);

const formatDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
};

/**
 * Generate Swiss payment reference (21 digits)
 */
const generateSwissReference = (invoiceNumber) => {
  // Extract numeric part from invoice number (e.g., "INV-00042" -> "00042")
  const numPart = invoiceNumber.replace(/\D/g, "").padStart(5, "0");
  // Generate a unique reference: 21-00000-00000-XXXXX-XXXXX-XXXXX
  const timestamp = Date.now().toString().slice(-5);
  const random = Math.floor(Math.random() * 10000).toString().padStart(5, "0");
  return `21-00000-${numPart.padStart(5, "0")}-${timestamp}-${random}`;
};

/**
 * Generate Swiss QR-bill data string
 */
const generateQRBillData = (invoice, reference) => {
  const ba = invoice.billingAddress || {};
  const custName = ba.companyName || ba.name || 
    `${invoice.customer?.firstName || ""} ${invoice.customer?.lastName || ""}`.trim() || "Kunde";
  
  // Swiss QR-bill format
  const lines = [
    "SPC", // QR Type
    "0200", // Version
    "1", // Coding Type
    COMPANY.iban.replace(/-/g, ""), // Creditor Account (IBAN without dashes)
    "K", // Creditor Address Type
    COMPANY.name,
    COMPANY.street,
    COMPANY.city,
    "CH", // Country
    "", // Creditor Address Line 2 (empty)
    "", // Creditor Address Line 3 (empty)
    "", // Creditor Address Line 4 (empty)
    "", // Creditor Address Line 5 (empty)
    "", // Creditor Address Line 6 (empty)
    "", // Creditor Address Line 7 (empty)
    "CHF", // Currency
    invoice.total.toFixed(2), // Amount
    "K", // Ultimate Creditor Address Type
    COMPANY.name,
    COMPANY.street,
    COMPANY.city,
    "CH",
    "QRR", // Reference Type
    reference.replace(/-/g, ""), // Reference (without dashes)
    "", // Additional Information (empty for QRR)
    "EPD", // Additional Information (empty)
    custName, // Ultimate Debtor Name
    ba.street || "",
    `${ba.zip || ""} ${ba.city || ""}`.trim(),
    ba.country === "Schweiz" ? "CH" : (ba.country || "CH"),
  ];
  
  return lines.join("\n");
};

/**
 * Generate a professional Swiss invoice PDF with payment slip and return it as a Buffer.
 *
 * @param {Object} invoice  – Fully populated Mongoose invoice document (with customer, order, lineItems, etc.)
 * @returns {Promise<Buffer>}
 */
export const generateInvoicePdf = (invoice) => {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = doc.page.width;
      const pageH = doc.page.height;
      const marginL = 50;
      const marginR = 50;
      const contentW = pageW - marginL - marginR;

      // ─── Top Section: Invoice Header ────────────────────────
      let y = 50;

      // Company logo/name
      doc
        .fontSize(20)
        .fillColor(PRIMARY)
        .text(COMPANY.name, marginL, y, { width: contentW });

      doc
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `${COMPANY.street} · ${COMPANY.city} · ${COMPANY.country}`,
          marginL,
          y + 20
        )
        .text(
          `Telefon: ${COMPANY.phone} · E-Mail: ${COMPANY.email}`,
          marginL,
          y + 31
        );

      // Invoice number and date (right aligned)
      const invoiceNumX = pageW - marginR - 150;
      doc
        .fontSize(14)
        .fillColor(DARK)
        .text(`Rechnung-Nr. ${invoice.invoiceNumber}`, invoiceNumX, y, { width: 150, align: "right" });
      
      doc
        .fontSize(8)
        .fillColor(MUTED)
        .text(`Datum: ${formatDate(invoice.invoiceDate)}`, invoiceNumX, y + 18, { width: 150, align: "right" });

      y += 60;

      // Red accent line
      doc
        .moveTo(marginL, y)
        .lineTo(pageW - marginR, y)
        .strokeColor(PRIMARY)
        .lineWidth(2)
        .stroke();

      y += 20;

      // ─── Customer Address (Left) ────────────────────────────
      const ba = invoice.billingAddress || {};
      const custName = ba.companyName || 
        `${invoice.customer?.firstName || ""} ${invoice.customer?.lastName || ""}`.trim() || "Kunde";
      
      doc.fontSize(8).fillColor(MUTED).text("Rechnungsempfänger:", marginL, y);
      y += 12;
      doc.fontSize(10).fillColor(DARK);
      
      if (ba.companyName) {
        doc.text(ba.companyName, marginL, y);
        y += 14;
      }
      if (ba.name) {
        doc.text(ba.name, marginL, y);
        y += 14;
      }
      const streetLine = [ba.street, ba.streetNumber].filter(Boolean).join(" ");
      if (streetLine) {
        doc.text(streetLine, marginL, y);
        y += 14;
      }
      const cityLine = [ba.zip, ba.city].filter(Boolean).join(" ");
      if (cityLine) {
        doc.text(cityLine, marginL, y);
        y += 14;
      }
      if (ba.country && ba.country !== "Schweiz") {
        doc.text(ba.country, marginL, y);
        y += 14;
      }

      // ─── Salutation and Introduction ────────────────────────
      y += 10;
      doc.fontSize(10).fillColor(DARK);
      const custSalutation = invoice.customer?.salutation;
      let salutation;
      if (ba.companyName || custSalutation === "company") {
        salutation = "Sehr geehrte Damen und Herren";
      } else if (["mrs", "ms"].includes(custSalutation)) {
        salutation = `Sehr geehrte Frau ${custName}`;
      } else {
        salutation = `Sehr geehrter Herr ${custName}`;
      }
      doc.text(salutation, marginL, y);
      y += 16;
      
      doc.text(
        "Für die Erledigung der von Ihnen beauftragten Tätigkeiten berechnen wir Ihnen wie folgt:",
        marginL,
        y,
        { width: contentW }
      );
      y += 20;

      // ─── Line Items Table ───────────────────────────────────
      const tableStartY = y;
      
      // Table header
      doc.rect(marginL, y, contentW, 20).fill("#f3f4f6");
      doc.fontSize(8).fillColor(MUTED);
      doc.text("Position", marginL + 4, y + 6);
      doc.text("Bezeichnung", marginL + 60, y + 6);
      doc.text("Menge", marginL + contentW * 0.6, y + 6);
      doc.text("Einzelpreis", marginL + contentW * 0.72, y + 6);
      doc.text("Gesamt", marginL + contentW * 0.85, y + 6, { align: "right" });

      y += 22;

      // Table rows
      const items = invoice.lineItems || [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        if (y > pageH - 400) {
          doc.addPage();
          y = 50;
        }

        // Alternate row background
        if (i % 2 === 0) {
          doc.rect(marginL, y - 2, contentW, 16).fill("#fafafa");
        }

        doc.fontSize(9).fillColor(DARK);
        doc.text(String(i + 1), marginL + 4, y + 2);
        doc.text(item.description || "", marginL + 60, y + 2, { width: contentW * 0.5 });
        doc.text(String(item.quantity || 0), marginL + contentW * 0.6, y + 2);
        doc.text(`${item.unit || "Stk."}`, marginL + contentW * 0.65, y + 2);
        doc.text(`CHF ${fmt(item.unitPrice)}`, marginL + contentW * 0.72, y + 2);
        doc.text(`CHF ${fmt(item.total)}`, marginL + contentW * 0.85, y + 2, { align: "right" });

        y += 16;
      }

      // Bottom border
      doc.moveTo(marginL, y).lineTo(pageW - marginR, y).strokeColor(BORDER).lineWidth(0.5).stroke();
      y += 15;

      // ─── Totals Section ──────────────────────────────────────
      const totalsX = marginL + contentW * 0.55;
      const totalsW = contentW * 0.45;
      const labelX = totalsX;
      const valX = totalsX + totalsW - 4;

      const drawTotalRow = (label, value, opts = {}) => {
        doc.fontSize(opts.bold ? 11 : 9).fillColor(opts.color || DARK);
        doc.text(label, labelX, y, { width: totalsW * 0.6 });
        doc.text(value, labelX, y, { width: totalsW, align: "right" });
        y += opts.bold ? 20 : 16;
      };

      drawTotalRow("Summe", `CHF ${fmt(invoice.subtotal)}`);

      if (invoice.discountAmount > 0) {
        const discLabel = invoice.discount?.type === "percentage"
          ? `Rabatt (${invoice.discount.value}%)`
          : "Rabatt";
        drawTotalRow(discLabel, `- CHF ${fmt(invoice.discountAmount)}`);
      }

      drawTotalRow(`MwSt. (${invoice.taxRate || 0}%)`, `CHF ${fmt(invoice.taxAmount)}`);

      // Divider
      doc.moveTo(labelX, y - 4).lineTo(pageW - marginR, y - 4).strokeColor(BORDER).lineWidth(0.5).stroke();

      drawTotalRow("Rechnungstotal", `CHF ${fmt(invoice.total)}`, { bold: true, color: PRIMARY });

      // ─── Payment Instructions ──────────────────────────────
      y += 15;
      if (y > pageH - 350) {
        doc.addPage();
        y = 50;
      }
      doc.fontSize(9).fillColor(DARK);
      doc.text(
        "Ich bitte um Überweisung des Rechnungsbetrages innerhalb von 30 Tagen.",
        marginL,
        y,
        { width: contentW }
      );
      y += 20;
      doc.text("Mit freundlichen Grüssen", marginL, y);
      y += 16;
      doc.text(COMPANY.name.split(" ")[0], marginL, y); // First word of company name

      // ─── Payment Slip Section (Bottom) ───────────────────────
      // Reserve space for payment slip (about 200px from bottom)
      let paymentSlipY = pageH - 200;
      
      // Draw separator line
      doc
        .moveTo(marginL, paymentSlipY - 10)
        .lineTo(pageW - marginR, paymentSlipY - 10)
        .strokeColor(BORDER)
        .lineWidth(1)
        .stroke();

      // Generate payment reference
      const reference = generateSwissReference(invoice.invoiceNumber);
      const qrData = generateQRBillData(invoice, reference);

      // ─── Empfangsschein (Left Part) ──────────────────────────
      const receiptX = marginL;
      const receiptW = (contentW - 20) / 2;
      let receiptY = paymentSlipY;
      
      doc.fontSize(7).fillColor(MUTED).text("Empfangsschein", receiptX, receiptY);
      receiptY += 12;

      doc.fontSize(7).fillColor(DARK);
      doc.text("Konto-/Zahlbar an:", receiptX, receiptY);
      receiptY += 10;
      doc.text(COMPANY.account, receiptX, receiptY);
      receiptY += 10;
      doc.text(COMPANY.name, receiptX, receiptY);
      receiptY += 10;
      doc.text(COMPANY.street, receiptX, receiptY);
      receiptY += 10;
      doc.text(COMPANY.city, receiptX, receiptY);
      receiptY += 15;

      doc.text("Referenz:", receiptX, receiptY);
      receiptY += 10;
      doc.text(reference, receiptX, receiptY);
      receiptY += 15;

      doc.text("Zahlbar durch:", receiptX, receiptY);
      receiptY += 10;
      if (ba.companyName) {
        doc.text(ba.companyName, receiptX, receiptY);
        receiptY += 10;
      }
      if (ba.name) {
        doc.text(ba.name, receiptX, receiptY);
        receiptY += 10;
      }
      const custStreet = [ba.street, ba.streetNumber].filter(Boolean).join(" ");
      if (custStreet) {
        doc.text(custStreet, receiptX, receiptY);
        receiptY += 10;
      }
      const custCity = [ba.zip, ba.city].filter(Boolean).join(" ");
      if (custCity) {
        doc.text(custCity, receiptX, receiptY);
        receiptY += 10;
      }
      receiptY += 10;

      doc.text("Währung - Betrag:", receiptX, receiptY);
      receiptY += 10;
      doc.fontSize(10).fillColor(PRIMARY).text(`CHF ${fmt(invoice.total)}`, receiptX, receiptY);

      // ─── Zahlteil (Right Part with QR Code) ──────────────────
      const paymentX = marginL + receiptW + 20;
      let paymentY = paymentSlipY; // Start at same level as receipt

      doc.fontSize(7).fillColor(MUTED).text("Zahlteil", paymentX, paymentY);
      paymentY += 12;

      // QR Code placeholder (will be generated if qrcode library is available)
      const qrSize = 80;
      const qrX = paymentX + (receiptW - qrSize) / 2;
      const qrY = paymentY;
      
      // Draw QR code placeholder box
      doc
        .rect(qrX, qrY, qrSize, qrSize)
        .strokeColor(BORDER)
        .lineWidth(1)
        .stroke();
      
      doc.fontSize(6).fillColor(MUTED).text("QR Code", qrX + qrSize / 2 - 15, qrY + qrSize / 2 - 3, { width: 30, align: "center" });
      
      // Try to generate QR code if library is available
      try {
        // Uncomment when qrcode is installed:
        // const QRCode = (await import("qrcode")).default;
        // const qrBuffer = await QRCode.toBuffer(qrData, { width: qrSize, margin: 1 });
        // doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
      } catch (err) {
        // QR code library not available, use placeholder
        console.log("QR code library not available, using placeholder");
      }

      paymentY += qrSize + 15;

      doc.fontSize(7).fillColor(DARK);
      doc.text("Konto-/Zahlbar an:", paymentX, paymentY);
      paymentY += 10;
      doc.text(COMPANY.account, paymentX, paymentY);
      paymentY += 10;
      doc.text(COMPANY.name, paymentX, paymentY);
      paymentY += 10;
      doc.text(COMPANY.street, paymentX, paymentY);
      paymentY += 10;
      doc.text(COMPANY.city, paymentX, paymentY);
      paymentY += 15;

      doc.text("Referenz:", paymentX, paymentY);
      paymentY += 10;
      doc.text(reference, paymentX, paymentY);
      paymentY += 15;

      doc.text("Zahlbar durch:", paymentX, paymentY);
      paymentY += 10;
      if (ba.companyName) {
        doc.text(ba.companyName, paymentX, paymentY);
        paymentY += 10;
      }
      if (ba.name) {
        doc.text(ba.name, paymentX, paymentY);
        paymentY += 10;
      }
      const payStreet = [ba.street, ba.streetNumber].filter(Boolean).join(" ");
      if (payStreet) {
        doc.text(payStreet, paymentX, paymentY);
        paymentY += 10;
      }
      const payCity = [ba.zip, ba.city].filter(Boolean).join(" ");
      if (payCity) {
        doc.text(payCity, paymentX, paymentY);
        paymentY += 10;
      }
      paymentY += 10;

      doc.text("Währung - Betrag:", paymentX, paymentY);
      paymentY += 10;
      doc.fontSize(10).fillColor(PRIMARY).text(`CHF ${fmt(invoice.total)}`, paymentX, paymentY);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Upload a PDF buffer to S3 and return the URL + key.
 *
 * @param {Buffer} pdfBuffer
 * @param {string} invoiceNumber  – e.g. "INV-00042"
 * @returns {Promise<{ pdfUrl: string, pdfKey: string }>}
 */
export const uploadPdfToS3 = async (pdfBuffer, invoiceNumber) => {
  const key = `invoices/${invoiceNumber}_${Date.now()}.pdf`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: pdfBuffer,
      ContentType: "application/pdf",
    })
  );

  const pdfUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
  return { pdfUrl, pdfKey: key };
};
