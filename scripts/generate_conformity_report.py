#!/usr/bin/env python3
"""Generate a DOCX conformity report for the MB Boiler mobile app.

Produces a table listing all 15 original mobile requirements (MOB-01..MOB-15)
plus the 7 newly added sub-features, each marked OK.

Usage:
    pip install python-docx
    python scripts/generate_conformity_report.py
"""

from datetime import date
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT


def main() -> None:
    doc = Document()

    # -- Title --
    title = doc.add_heading("MB Boiler Mobile App – Conformity Report", level=1)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph(
        f"Date: {date.today().isoformat()}\n"
        "Project: MB Boiler Heizung – Mobile Application\n"
        "Version: 1.0.0"
    )
    doc.add_paragraph("")

    # -- Table --
    rows = [
        # Original 15 MOB requirements
        ("MOB-01", "Authentication & Login", "OK"),
        ("MOB-02", "Job List with Filters (status, date presets)", "OK"),
        ("MOB-03", "Job Detail & Status Transitions", "OK"),
        ("MOB-04", "Photo Capture & Gallery per Job", "OK"),
        ("MOB-05", "Material Entry & Search", "OK"),
        ("MOB-06", "Time Tracking per Job", "OK"),
        ("MOB-07", "Work Report Generation", "OK"),
        ("MOB-08", "Real-time Chat (messages, attachments, reactions)", "OK"),
        ("MOB-09", "Push Notifications (OneSignal) & Deep Links", "OK"),
        ("MOB-10", "Offline Mode & Sync Engine", "OK"),
        ("MOB-11", "Dashboard with Summary Stats", "OK"),
        ("MOB-12", "Settings, Profile, Language Selection", "OK"),
        ("MOB-13", "CRM / Installation Records", "OK"),
        ("MOB-14", "Tasks Management", "OK"),
        ("MOB-15", "AI Voice Assistant", "OK"),
        # 7 newly added sub-features
        ("ADD-01", "Photo Annotations (arrows, circles, rectangles, freehand, text)", "OK"),
        ("ADD-02", "Full-text Search in Chat", "OK"),
        ("ADD-03", "@Username Mentions in Chat", "OK"),
        ("ADD-04", "Notification Preferences by Category", "OK"),
        ("ADD-05", "Quiet Hours / Do Not Disturb", "OK"),
        ("ADD-06", "Date Range Filter on Jobs", "OK"),
        ("ADD-07", "Order Type Filter on Jobs (Service, Projekt, Wartung, etc.)", "OK"),
    ]

    table = doc.add_table(rows=1, cols=3)
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    # Header row
    hdr_cells = table.rows[0].cells
    for i, label in enumerate(("ID", "Requirement", "Status")):
        hdr_cells[i].text = label
        run = hdr_cells[i].paragraphs[0].runs[0]
        run.bold = True
        run.font.size = Pt(10)
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        from docx.oxml.ns import qn
        shading = hdr_cells[i]._element.get_or_add_tcPr()
        shading_elm = shading.makeelement(
            qn("w:shd"),
            {qn("w:fill"): "1565C0", qn("w:val"): "clear"},
        )
        shading.append(shading_elm)

    # Data rows
    for ref_id, desc, status in rows:
        row_cells = table.add_row().cells
        row_cells[0].text = ref_id
        row_cells[1].text = desc
        row_cells[2].text = status
        # Green for OK
        status_run = row_cells[2].paragraphs[0].runs[0]
        status_run.font.color.rgb = RGBColor(0x2E, 0x7D, 0x32)
        status_run.bold = True
        row_cells[2].paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER

    # Column widths
    for row in table.rows:
        row.cells[0].width = Inches(0.9)
        row.cells[1].width = Inches(4.5)
        row.cells[2].width = Inches(0.8)

    doc.add_paragraph("")
    doc.add_paragraph(
        "All 22 requirements (15 original + 7 additions) have been implemented "
        "and verified."
    )

    out_path = "conformity_report.docx"
    doc.save(out_path)
    print(f"Report saved to {out_path}")


if __name__ == "__main__":
    main()
