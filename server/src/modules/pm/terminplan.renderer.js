import PDFDocument from 'pdfkit';

/**
 * Terminplan renderer — reproduces the client's weekly half-day grid template
 * (docs/loic/terminplan.png): header block, then one table per calendar week
 * with Arbeit / Firma / Telefon columns and Mon–Fri × Morgen/NM slots, each
 * task coloured with a stable per-row colour. Weeks without any active phase
 * are skipped, exactly like the template.
 *
 * The week model is shared with the Excel export (buildTerminplanWeeks), so
 * both outputs always agree.
 */

const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
export const TASK_COLORS = [
  '#C55A11', // brown/orange
  '#FFC000', // yellow
  '#70AD47', // green
  '#4472C4', // blue
  '#FF0000', // red
  '#7030A0', // purple
  '#5B9BD5', // light blue
  '#843C0C', // dark brown
];

const dateOnly = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const mondayOf = (d) => {
  const x = dateOnly(d);
  const day = (x.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(x, -day);
};
const chDate = (d) => d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Half-day slot activity: slot = { date, half: 'morning'|'afternoon' }.
 * Boundaries respect startHalf/endHalf; interior days are fully covered.
 */
function slotActive(task, date, half) {
  const d = dateOnly(date).getTime();
  const s = dateOnly(task.startDate).getTime();
  const e = dateOnly(task.endDate).getTime();
  if (d < s || d > e) return false;
  if (d === s && task.startHalf === 'afternoon' && half === 'morning') return false;
  if (d === e && task.endHalf === 'morning' && half === 'afternoon') return false;
  return true;
}

/**
 * Shared week model. tasks: [{ name, company, phone, startDate, endDate,
 * startHalf, endHalf, color }]. Returns [{ index, days: [Date×5], rows:
 * [{ task, cells: [bool×10] }] }] — only weeks and rows with activity.
 */
export function buildTerminplanWeeks(tasks) {
  const dated = tasks.filter((t) => t.startDate && t.endDate);
  if (!dated.length) return [];
  const first = mondayOf(new Date(Math.min(...dated.map((t) => dateOnly(t.startDate)))));
  const last = dateOnly(new Date(Math.max(...dated.map((t) => dateOnly(t.endDate)))));

  const weeks = [];
  let index = 0;
  for (let monday = first; monday <= last; monday = addDays(monday, 7)) {
    const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
    const rows = dated
      .map((task) => ({
        task,
        cells: days.flatMap((day) => [slotActive(task, day, 'morning'), slotActive(task, day, 'afternoon')]),
      }))
      .filter((row) => row.cells.some(Boolean));
    index += 1;
    if (rows.length) weeks.push({ index, days, rows });
  }
  return weeks;
}

// ── PDF layout (A4 landscape) ────────────────────────────────────────────────
const PAGE = { width: 841.89, height: 595.28, margin: 24 };
const COLS = { arbeit: 130, firma: 120, telefon: 78 };
const NAVY = '#1F3864';
const GRID = '#000000';

export function renderTerminplanPdf({
  title, projectName, periodLabel, customerName, customerPhone,
  contacts = [], logoBuffer, weeks, milestones = [],
  variant = 'internal', companyName = '', projectManagerName = '',
  responsibilities = [], internalNotes = [],
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: PAGE.margin });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), pageCount: doc.bufferedPageRange().count }));
    doc.on('error', reject);

    // External protocol hides the internal "Firma / Telefon" columns (who does
    // what) — the customer only sees the schedule itself. Their width is handed
    // to the day slots so the grid stays full-bleed.
    const isExternal = variant === 'external';
    const cols = isExternal ? { arbeit: 160, firma: 0, telefon: 0 } : { arbeit: 130, firma: 120, telefon: 78 };
    const labelWidth = cols.arbeit + cols.firma + cols.telefon;

    const innerWidth = PAGE.width - 2 * PAGE.margin;
    const slotWidth = (innerWidth - labelWidth) / 10;
    const gridX = PAGE.margin;

    // ── header ──
    const drawHeader = () => {
      const top = PAGE.margin;
      doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY);
      const titleH = doc.heightOfString(title, { width: 380 });
      doc.text(title, gridX, top, { width: 380 });
      // variant subtitle right under the title
      const subtitle = isExternal ? 'Externes Protokoll – für den Kunden' : 'Internes Protokoll';
      doc.font('Helvetica').fontSize(9).fillColor('#666').text(subtitle, gridX, top + titleH + 1, { width: 380 });

      // left block — Projekt / Zeitraum / Projektleiter, below the title
      const leftY = top + titleH + 16;
      doc.fontSize(9).fillColor(NAVY);
      doc.font('Helvetica').text('Projekt:', gridX, leftY);
      doc.font('Helvetica-Bold').fillColor('#000')
        .text(projectName || '—', gridX + 55, leftY, { width: 300, height: 11, ellipsis: true, lineBreak: false });
      doc.font('Helvetica').fillColor(NAVY).text('Zeitraum:', gridX, leftY + 14);
      doc.font('Helvetica-Bold').fillColor('#000')
        .text(periodLabel || '—', gridX + 55, leftY + 14, { width: 300, lineBreak: false });
      doc.font('Helvetica').fillColor(NAVY).text('Projektleiter:', gridX, leftY + 28);
      doc.font('Helvetica-Bold').fillColor('#000')
        .text(projectManagerName || '—', gridX + 55, leftY + 28, { width: 300, lineBreak: false });

      // centre block — Kunde / Telefon
      const cx = gridX + 340;
      doc.font('Helvetica').fillColor(NAVY).text('Kunde:', cx, top + 2);
      doc.font('Helvetica-Bold').fillColor('#000')
        .text(customerName || '—', cx + 50, top + 2, { width: 200 });
      doc.font('Helvetica').fillColor(NAVY).text('Telefon:', cx, top + 16);
      doc.font('Helvetica-Bold').fillColor('#000')
        .text(customerPhone || '—', cx + 50, top + 16, { width: 200 });

      // right block — logo + company + contacts
      const logoW = 120;
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, PAGE.width - PAGE.margin - logoW, top, { fit: [logoW, 40] });
        } catch { /* corrupt/unsupported logo asset — header stays text-only */ }
      }
      let rY = top + 46;
      if (companyName) {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY)
          .text(companyName, PAGE.width - PAGE.margin - 290, rY, { width: 290, align: 'right' });
        rY += 11;
      }
      // Internal shows the internal contacts; external keeps it to the company.
      if (!isExternal) {
        doc.font('Helvetica').fontSize(7.5).fillColor('#333');
        contacts.forEach((line) => {
          doc.text(line, PAGE.width - PAGE.margin - 290, rY, { width: 290, align: 'right' });
          rY += 10;
        });
      }
      doc.fillColor('#000');
      const leftBottom = leftY + 42;
      const rightBottom = rY;
      return Math.max(leftBottom, rightBottom) + 14;
    };

    let y = drawHeader();

    const ensureSpace = (needed) => {
      if (y + needed <= PAGE.height - PAGE.margin) return;
      doc.addPage();
      y = PAGE.margin + 6;
    };

    // ── one table per week ──
    for (const week of weeks) {
      const headerH = 12; // dates row
      const dayRowH = 22;
      const rowH = 16;
      const blockH = 14 + headerH + dayRowH + week.rows.length * rowH;
      ensureSpace(blockH + 18);

      // "Woche N:" + dates above day columns
      doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(`Woche ${week.index}:`, gridX, y);
      doc.fontSize(8).fillColor('#000');
      week.days.forEach((day, i) => {
        const x = gridX + labelWidth + i * 2 * slotWidth;
        doc.text(chDate(day), x, y + 1, { width: 2 * slotWidth, align: 'center' });
      });
      y += 14;

      const tableX = gridX;
      const tableW = innerWidth;
      const daysX = tableX + labelWidth;

      // day header row (Montag Morgen / NM …)
      doc.lineWidth(0.7).rect(tableX, y, tableW, dayRowH).stroke(GRID);
      doc.font('Helvetica-Bold').fontSize(7);
      doc.text('Arbeit', tableX + 3, y + dayRowH - 10);
      if (!isExternal) {
        doc.text('Firma', tableX + cols.arbeit + 3, y + dayRowH - 10);
        doc.text('Telefon', tableX + cols.arbeit + cols.firma + 3, y + dayRowH - 10);
      }
      for (let i = 0; i < 10; i++) {
        const x = daysX + i * slotWidth;
        doc.moveTo(x, y).lineTo(x, y + dayRowH).stroke(GRID);
        const day = DAY_NAMES[Math.floor(i / 2)];
        const half = i % 2 === 0 ? 'Morgen' : 'NM';
        doc.text(day, x + 1.5, y + 2, { width: slotWidth - 3, lineBreak: false });
        doc.text(half, x + 1.5, y + 10, { width: slotWidth - 3, lineBreak: false });
      }
      if (!isExternal) {
        doc.moveTo(tableX + cols.arbeit, y).lineTo(tableX + cols.arbeit, y + dayRowH).stroke(GRID);
        doc.moveTo(tableX + cols.arbeit + cols.firma, y).lineTo(tableX + cols.arbeit + cols.firma, y + dayRowH).stroke(GRID);
      }
      y += dayRowH;

      // task rows
      doc.font('Helvetica').fontSize(7.5);
      for (const row of week.rows) {
        doc.rect(tableX, y, tableW, rowH).stroke(GRID);
        doc.fillColor('#000');
        doc.text(row.task.name || '', tableX + 3, y + 4, { width: cols.arbeit - 6, lineBreak: false });
        if (!isExternal) {
          doc.text(row.task.company || '', tableX + cols.arbeit + 3, y + 4, { width: cols.firma - 6, lineBreak: false });
          doc.text(row.task.phone || '', tableX + cols.arbeit + cols.firma + 3, y + 4, { width: cols.telefon - 6, lineBreak: false });
        }
        row.cells.forEach((active, i) => {
          const x = daysX + i * slotWidth;
          if (active) {
            doc.rect(x + 0.35, y + 0.35, slotWidth - 0.7, rowH - 0.7).fill(row.task.color);
            doc.fillColor('#000');
          }
          doc.moveTo(x, y).lineTo(x, y + rowH).stroke(GRID);
        });
        if (!isExternal) {
          doc.moveTo(tableX + cols.arbeit, y).lineTo(tableX + cols.arbeit, y + rowH).stroke(GRID);
          doc.moveTo(tableX + cols.arbeit + cols.firma, y).lineTo(tableX + cols.arbeit + cols.firma, y + rowH).stroke(GRID);
        }
        y += rowH;
      }
      y += 18;
    }

    // ── milestones (not part of the template, kept as a compact list) ──
    if (milestones.length) {
      ensureSpace(16 + milestones.length * 11);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('Meilensteine', gridX, y);
      y += 13;
      doc.font('Helvetica').fontSize(8).fillColor('#000');
      for (const ms of milestones) {
        doc.text(`${ms.date ? chDate(new Date(ms.date)) : '—'}  ${ms.name}`, gridX + 4, y);
        y += 11;
      }
    }

    // ── internal-only sections: Zuständigkeiten + Interne Notizen ──
    if (!isExternal && responsibilities.length) {
      ensureSpace(16 + responsibilities.length * 11);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text('Zuständigkeiten', gridX, y + 6);
      y += 19;
      doc.font('Helvetica').fontSize(8).fillColor('#000');
      for (const r of responsibilities) {
        doc.text(`${r.name}: ${r.company}${r.phone ? ' · ' + r.phone : ''}`, gridX + 4, y);
        y += 11;
      }
    }
    if (!isExternal && internalNotes.length) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY);
      ensureSpace(20);
      doc.text('Interne Notizen', gridX, y + 6);
      y += 19;
      doc.font('Helvetica').fontSize(8).fillColor('#000');
      for (const n of internalNotes) {
        const line = `${n.name}: ${n.notes}`;
        const h = doc.heightOfString(line, { width: innerWidth - 8 });
        ensureSpace(h + 4);
        doc.text(line, gridX + 4, y, { width: innerWidth - 8 });
        y += h + 4;
      }
    }
    if (isExternal) {
      ensureSpace(16);
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor('#888')
        .text('Externes Protokoll – ohne interne Details.', gridX, y + 6);
    }

    doc.end();
  });
}
