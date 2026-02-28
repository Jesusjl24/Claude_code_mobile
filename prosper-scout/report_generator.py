"""
Report generation for Prosper Scout.
Exports scraped listings as CSV or PDF.
"""

import csv
import io
from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def generate_csv(listings):
    """
    Generate a CSV file from a list of listing dicts.

    Returns:
        A tuple of (filename, csv_string).
    """
    today = date.today().isoformat()
    filename = f"prosper-scout-report-{today}.csv"

    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        "Business Name",
        "Asking Price",
        "Location",
        "Description",
        "Listing URL",
    ])

    # Data rows
    for listing in listings:
        writer.writerow([
            listing.get("name", "Not Found"),
            listing.get("price", "Not Found"),
            listing.get("location", "Not Found"),
            listing.get("description", "Not Found"),
            listing.get("url", ""),
        ])

    csv_string = output.getvalue()
    output.close()

    return filename, csv_string


def generate_pdf(listings):
    """
    Generate a PDF report from a list of listing dicts.

    Returns:
        A tuple of (filename, pdf_bytes).
    """
    today = date.today().isoformat()
    filename = f"prosper-scout-report-{today}.pdf"

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20 * mm,
        leftMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "ProsperTitle",
        parent=styles["Title"],
        fontSize=20,
        textColor=colors.HexColor("#1a2744"),
        spaceAfter=6,
    )

    subtitle_style = ParagraphStyle(
        "ProsperSubtitle",
        parent=styles["Normal"],
        fontSize=11,
        textColor=colors.HexColor("#666666"),
        spaceAfter=16,
    )

    label_style = ParagraphStyle(
        "FieldLabel",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#1a2744"),
        fontName="Helvetica-Bold",
    )

    value_style = ParagraphStyle(
        "FieldValue",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#333333"),
    )

    not_found_style = ParagraphStyle(
        "NotFound",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.HexColor("#999999"),
        fontName="Helvetica-Oblique",
    )

    elements = []

    # Header
    elements.append(Paragraph(
        "Prosper Scout — Business Listings Report",
        title_style,
    ))
    elements.append(Paragraph(
        f"Generated: {today} &nbsp;|&nbsp; Total listings: {len(listings)}",
        subtitle_style,
    ))
    elements.append(Spacer(1, 8))

    # Each listing as a block
    fields = [
        ("Business Name", "name"),
        ("Asking Price", "price"),
        ("Location", "location"),
        ("Description", "description"),
        ("Listing URL", "url"),
    ]

    for i, listing in enumerate(listings):
        table_data = []
        for label, key in fields:
            val = listing.get(key, "Not Found")
            label_p = Paragraph(f"<b>{label}:</b>", label_style)

            if val == "Not Found":
                val_p = Paragraph(val, not_found_style)
            else:
                # Truncate long descriptions for PDF readability
                display_val = val
                if key == "description" and len(val) > 500:
                    display_val = val[:500] + "..."
                # Escape XML entities for reportlab
                display_val = (
                    display_val
                    .replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;")
                )
                val_p = Paragraph(display_val, value_style)

            table_data.append([label_p, val_p])

        table = Table(table_data, colWidths=[90, 380])
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f5f5f5")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("LINEBELOW", (0, 0), (-1, -2), 0.5, colors.HexColor("#e0e0e0")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cccccc")),
        ]))

        elements.append(table)
        elements.append(Spacer(1, 14))

    doc.build(elements)
    pdf_bytes = buffer.getvalue()
    buffer.close()

    return filename, pdf_bytes
