#!/usr/bin/env python3
import json, sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))

def build(payload):
    path = payload['output']; rows = payload.get('rows', []); columns = payload.get('columns') or (list(rows[0]) if rows else []); title = payload.get('title', 'FormFlow Report')
    page_size = landscape(A4) if len(columns) > 6 else A4
    styles = getSampleStyleSheet(); title_style = ParagraphStyle('TitleCN', parent=styles['Title'], fontName='STSong-Light', alignment=TA_CENTER, spaceAfter=16)
    body_style = ParagraphStyle('BodyCN', parent=styles['BodyText'], fontName='STSong-Light', fontSize=8, leading=10)
    doc = SimpleDocTemplate(path, pagesize=page_size, rightMargin=28, leftMargin=28, topMargin=38, bottomMargin=32, title=title)
    content = [Paragraph(str(title), title_style), Spacer(1, 6)]
    table_data = [[Paragraph(str(col), body_style) for col in columns]] + [[Paragraph(str(row.get(col, '')), body_style) for col in columns] for row in rows]
    if columns:
        width = (page_size[0] - 56) / len(columns); table = Table(table_data, colWidths=[width] * len(columns), repeatRows=1)
        table.setStyle(TableStyle([('FONTNAME',(0,0),(-1,-1),'STSong-Light'),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#1677ff')),('TEXTCOLOR',(0,0),(-1,0),colors.white),('GRID',(0,0),(-1,-1),0.35,colors.HexColor('#d9d9d9')),('VALIGN',(0,0),(-1,-1),'TOP'),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f7f9fc')]),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),5),('BOTTOMPADDING',(0,0),(-1,-1),5)])); content.append(table)
    def footer(canvas, document):
        canvas.saveState(); canvas.setFont('STSong-Light', 8); canvas.setFillColor(colors.HexColor('#777777')); canvas.drawCentredString(page_size[0]/2, 16, f'第 {document.page} 页'); canvas.restoreState()
    doc.build(content, onFirstPage=footer, onLaterPages=footer)

if __name__ == '__main__': build(json.load(sys.stdin))
