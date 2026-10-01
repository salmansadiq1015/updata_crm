import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import { pdfColors } from '../doctpl/renderer/renderers/colors.js';

/**
 * Standalone PDF renderer for a vehicle's Materialliste.
 *
 * IMPORTANT: EVERY doc.text() call MUST include { lineBreak: false }.
 * Without it PDFKit auto-paginates when its internal cursor drifts past
 * the bottom margin — producing blank extra pages.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '../../assets/ci-defaults');

const PAGE = { width: 595.28, height: 841.89, margin: 40 };
const FOOTER_Y = PAGE.height - 25;
const USABLE_BOTTOM = PAGE.height - PAGE.margin - 10;

const FONT_NAMES = { light: 'MBB-Fallback-Light', medium: 'MBB-Fallback-Medium', bold: 'MBB-Fallback-Bold' };

function tryReadFile(path) {
  try { return existsSync(path) ? readFileSync(path) : null; } catch { return null; }
}

/** Load local fallback fonts if CI config has none. */
function registerFonts(doc, ciConfig) {
  const fb = ciConfig?.fontBuffers || {};

  // If CI fonts are available, register them (same logic as fonts.js)
  if (fb.light)  doc.registerFont('MBB-CI-Light', fb.light);
  if (fb.medium) doc.registerFont('MBB-CI-Medium', fb.medium);
  if (fb.bold)   doc.registerFont('MBB-CI-Bold', fb.bold);

  const hasCiFonts = !!(fb.light && fb.bold);
  if (hasCiFonts) {
    return { body: 'MBB-CI-Light', medium: fb.medium ? 'MBB-CI-Medium' : 'MBB-CI-Light', bold: 'MBB-CI-Bold' };
  }

  // Try local fallback fonts
  const light  = tryReadFile(join(ASSETS_DIR, 'MuseoSans-300.ttf'));
  const medium = tryReadFile(join(ASSETS_DIR, 'MuseoSans-500.ttf'));
  const bold   = tryReadFile(join(ASSETS_DIR, 'MuseoSans-700.ttf'));
  if (light) doc.registerFont(FONT_NAMES.light, light);
  if (medium) doc.registerFont(FONT_NAMES.medium, medium);
  if (bold) doc.registerFont(FONT_NAMES.bold, bold);

  if (light && bold) {
    return { body: FONT_NAMES.light, medium: medium ? FONT_NAMES.medium : FONT_NAMES.light, bold: FONT_NAMES.bold };
  }

  // Ultimate fallback: Helvetica (built into PDFKit)
  return { body: 'Helvetica', medium: 'Helvetica-Bold', bold: 'Helvetica-Bold' };
}

/** Load logo: CI buffer → local fallback → null. */
function resolveLogo(ciConfig) {
  if (ciConfig?.logoBuffer) return ciConfig.logoBuffer;
  return tryReadFile(join(ASSETS_DIR, 'logo.png'));
}

const chDate = (d) =>
  (d instanceof Date ? d : new Date(d)).toLocaleDateString('de-CH', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

export function renderVehicleMaterialPdf({ vehicle, materials, ciConfig }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margin: PAGE.margin });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), pageCount: pageNum }));
    doc.on('error', reject);

    const fonts = registerFonts(doc, ciConfig);
    const colors = pdfColors(ciConfig);
    const logoBuffer = resolveLogo(ciConfig);

    const innerWidth = PAGE.width - 2 * PAGE.margin;
    const left = PAGE.margin;
    let y = PAGE.margin;
    let pageNum = 1;

    doc.info.Title = `Materialliste – ${vehicle.kennzeichen || ''}`;
    doc.info.Author = ciConfig?.companyName || 'Updata';
    doc.info.Creator = 'Updata ERP';
    doc.info.CreationDate = new Date();

    // ── Footer ──
    const drawFooter = (num) => {
      const company = ciConfig?.companyName || 'Updata';
      // FOOTER_Y sits below the bottom margin, and pdfkit answers any write
      // past that margin by starting a new page — which is how a one-page list
      // came out as three, the extras carrying nothing but this footer. Drop
      // the margin for the duration of the write, then restore it.
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font(fonts.body).fontSize(7).fillColor(colors.muted);
      doc.text(company, left, FOOTER_Y, { width: innerWidth * 0.5, align: 'left', lineBreak: false });
      doc.text(`Seite ${num}`, left + innerWidth * 0.5, FOOTER_Y, { width: innerWidth * 0.5, align: 'right', lineBreak: false });
      doc.page.margins.bottom = bottomMargin;
    };

    const ensureSpace = (needed) => {
      if (y + needed <= USABLE_BOTTOM) return;
      drawFooter(pageNum);
      doc.addPage();
      pageNum += 1;
      y = PAGE.margin;
    };

    // ── Header: logo (left) + company (right) ──
    if (logoBuffer) {
      try {
        const logoW = Math.min(Number(ciConfig?.logo?.width || 120), innerWidth * 0.4);
        doc.image(logoBuffer, left, y, { fit: [logoW, 40] });
      } catch { /* skip */ }
    }

    const ci = ciConfig?.companyDetails || {};
    doc.font(fonts.body).fontSize(8).fillColor(colors.primary);
    const companyLines = [
      ciConfig?.companyName || 'Updata',
      ci.address?.street,
      `${ci.address?.zip || ''} ${ci.address?.city || ''}`.trim() || null,
      ci.phone,
      ci.email,
    ].filter(Boolean);
    let compY = y;
    for (const line of companyLines) {
      doc.text(line, left + innerWidth * 0.55, compY, { width: innerWidth * 0.45, align: 'right', lineBreak: false });
      compY += 11;
    }

    y = Math.max(y + 50, compY) + 16;

    // ── Vehicle info ──
    doc.font(fonts.bold).fontSize(11).fillColor(colors.primary);
    doc.text(vehicle.kennzeichen || '—', left, y, { lineBreak: false });
    y += 16;

    doc.font(fonts.body).fontSize(9);
    const infoLines = [
      vehicle.label ? ['Bezeichnung', vehicle.label] : null,
      vehicle.make || vehicle.model ? ['Marke / Modell', [vehicle.make, vehicle.model].filter(Boolean).join(' ')] : null,
      vehicle.vin ? ['Fahrgestellnr.', vehicle.vin] : null,
      vehicle.year ? ['Jahrgang', String(vehicle.year)] : null,
    ].filter(Boolean);
    for (const [label, value] of infoLines) {
      doc.fillColor(colors.muted).text(`${label}:`, left, y, { lineBreak: false });
      doc.fillColor(colors.text).text(value, left + 100, y, { width: innerWidth - 100, lineBreak: false });
      y += 14;
    }

    y += 10;

    // ── Title ──
    doc.font(fonts.bold).fontSize(14).fillColor(colors.primary);
    doc.text('Materialliste', left, y, { lineBreak: false });
    doc.font(fonts.body).fontSize(8).fillColor(colors.muted);
    doc.text(`Stand: ${chDate(new Date())}`, left + innerWidth * 0.5, y + 4, { width: innerWidth * 0.5, align: 'right', lineBreak: false });
    y += 24;

    // ── Table ──
    const colPos  = { x: left,                       w: 36 };
    const colName = { x: left + 36,                   w: Math.round(innerWidth * 0.38) };
    const colQty  = { x: left + 36 + colName.w,       w: 50 };
    const colUnit = { x: left + 36 + colName.w + 50,  w: 50 };
    const colNote = { x: left + 36 + colName.w + 100, w: innerWidth - 36 - colName.w - 100 };
    const ROW_H = 18;
    const PAD = 5;

    // Header row
    ensureSpace(ROW_H + 20);
    doc.rect(left, y, innerWidth, ROW_H).fill(colors.tableHeader);
    doc.font(fonts.bold).fontSize(8).fillColor(colors.primary);
    doc.text('Pos.',        colPos.x + 4,  y + PAD, { width: colPos.w - 4,  lineBreak: false });
    doc.text('Bezeichnung', colName.x + 4, y + PAD, { width: colName.w - 4, lineBreak: false });
    doc.text('Menge',       colQty.x + 4,  y + PAD, { width: colQty.w - 4,  lineBreak: false });
    doc.text('Einheit',     colUnit.x + 4, y + PAD, { width: colUnit.w - 4, lineBreak: false });
    doc.text('Bemerkung',   colNote.x + 4, y + PAD, { width: colNote.w - 4, lineBreak: false });
    y += ROW_H;
    doc.moveTo(left, y).lineTo(left + innerWidth, y).lineWidth(0.5).strokeColor(colors.border).stroke();

    // Data rows
    materials.forEach((mat, idx) => {
      ensureSpace(ROW_H);

      if (idx % 2 === 1) {
        doc.rect(left, y, innerWidth, ROW_H).fill('#FAFAFA');
      }

      doc.font(fonts.body).fontSize(8).fillColor(colors.text);
      doc.text(String(idx + 1),                                  colPos.x + 4,  y + PAD, { width: colPos.w - 4,  lineBreak: false });
      doc.text(mat.name || '—',                                  colName.x + 4, y + PAD, { width: colName.w - 8, lineBreak: false, ellipsis: true });
      doc.text(mat.quantity != null ? String(mat.quantity) : '1', colQty.x + 4,  y + PAD, { width: colQty.w - 4,  lineBreak: false });
      doc.text(mat.unit || '',                                   colUnit.x + 4, y + PAD, { width: colUnit.w - 4, lineBreak: false });
      if (mat.note) {
        doc.fillColor(colors.muted);
        doc.text(mat.note, colNote.x + 4, y + PAD, { width: colNote.w - 8, lineBreak: false, ellipsis: true });
      }

      y += ROW_H;
      doc.moveTo(left, y).lineTo(left + innerWidth, y).lineWidth(0.3).strokeColor(colors.border).stroke();
    });

    // Empty list
    if (!materials.length) {
      doc.font(fonts.body).fontSize(9).fillColor(colors.muted);
      doc.text('Keine Materialien erfasst.', left, y + 8, { width: innerWidth, align: 'center', lineBreak: false });
    }

    drawFooter(pageNum);
    doc.end();
  });
}
