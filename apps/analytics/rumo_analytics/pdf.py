"""Relatório PDF real (ReportLab), com fonte Manrope incorporada (acentos) e gráfico vetorial
desenhado a partir do mesmo conjunto de dados exibido na tela."""
from __future__ import annotations

import io
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from reportlab.graphics.charts.barcharts import VerticalBarChart
from reportlab.graphics.shapes import Drawing, Line, Polygon, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle

from .money import fmt_brl

FONT_DIR = Path(__file__).parent / "fonts"
pdfmetrics.registerFont(TTFont("Manrope", str(FONT_DIR / "Manrope-Regular.ttf")))
pdfmetrics.registerFont(TTFont("Manrope-Bold", str(FONT_DIR / "Manrope-Bold.ttf")))
pdfmetrics.registerFontFamily("Manrope", normal="Manrope", bold="Manrope-Bold")

BLUE = colors.HexColor("#1F57FF")
DEEP = colors.HexColor("#0B1F4D")
INK = colors.HexColor("#14233B")
MUTED = colors.HexColor("#52627A")
BORDER = colors.HexColor("#DCE5F3")
SOFT = colors.HexColor("#F5F8FF")
NEG = colors.HexColor("#B42318")

H1 = ParagraphStyle("h1", fontName="Manrope-Bold", fontSize=18, leading=22, textColor=INK)
H2 = ParagraphStyle("h2", fontName="Manrope-Bold", fontSize=12.5, leading=16, textColor=INK, spaceBefore=10, spaceAfter=6)
BODY = ParagraphStyle("body", fontName="Manrope", fontSize=9.5, leading=13.5, textColor=INK, alignment=TA_LEFT)
SMALL = ParagraphStyle("small", parent=BODY, fontSize=8, leading=11, textColor=MUTED)
CELL = ParagraphStyle("cell", parent=BODY, fontSize=8.5, leading=11)
CELL_R = ParagraphStyle("cell_r", parent=CELL, alignment=2)

INDICATOR_HELP = [
    ("Receitas", "Soma das receitas realizadas com competência no período. Saldo inicial de conta não é receita."),
    ("Despesas", "Despesas realizadas por competência, incluindo compras no cartão na data da compra e encargos informados. "
                 "Pagamento de fatura e amortização de dívida não são novas despesas."),
    ("Resultado", "Receitas − Despesas (base de competência)."),
    ("Entradas/Saídas de caixa", "Movimento efetivo nas contas no período, sem transferências entre contas próprias."),
    ("Saldo", "Saldo inicial das contas + movimentos registrados até o fim do período. Controle informado pelo usuário."),
]


def _esc(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _logo(width: float = 60 * mm) -> Drawing:
    d = Drawing(width, 12 * mm)
    # símbolo: seta-bússola (dois triângulos) — mesma geometria do símbolo vetorial da marca
    d.add(Polygon([2, 6, 14, 28, 10, 16], fillColor=BLUE, strokeColor=None))
    d.add(Polygon([14, 28, 26, 6, 18, 16], fillColor=DEEP, strokeColor=None))
    d.add(String(32, 9, "RUMO", fontName="Manrope-Bold", fontSize=20, fillColor=INK))
    return d


def _bar_chart(series: list[dict]) -> Drawing:
    w, h = 170 * mm, 62 * mm
    d = Drawing(w, h)
    ch = VerticalBarChart()
    ch.x, ch.y, ch.width, ch.height = 14 * mm, 10 * mm, w - 20 * mm, h - 18 * mm
    inc = [int(s["income_cents"]) / 100 for s in series]
    exp = [int(s["expense_cents"]) / 100 for s in series]
    ch.data = [inc, exp]
    ch.categoryAxis.categoryNames = [s["month"][5:7] + "/" + s["month"][2:4] + ("" if s.get("complete", True) else "*") for s in series]
    ch.categoryAxis.labels.fontName = "Manrope"
    ch.categoryAxis.labels.fontSize = 7
    ch.valueAxis.labels.fontName = "Manrope"
    ch.valueAxis.labels.fontSize = 7
    ch.valueAxis.valueMin = 0
    ch.valueAxis.labelTextFormat = lambda v: f"{v:,.0f}".replace(",", ".")
    ch.bars[0].fillColor = BLUE
    ch.bars[1].fillColor = colors.HexColor("#9DB4F5")
    ch.bars.strokeColor = None
    ch.valueAxis.gridStrokeColor = BORDER
    ch.valueAxis.visibleGrid = True
    d.add(ch)
    d.add(String(14 * mm, h - 5 * mm, "■ Receitas", fontName="Manrope", fontSize=8, fillColor=BLUE))
    d.add(String(40 * mm, h - 5 * mm, "■ Despesas", fontName="Manrope", fontSize=8, fillColor=colors.HexColor("#6F8FE8")))
    d.add(String(66 * mm, h - 5 * mm, "Valores em R$ · * mês incompleto", fontName="Manrope", fontSize=7, fillColor=MUTED))
    d.add(Line(ch.x, ch.y, ch.x + ch.width, ch.y, strokeColor=MUTED, strokeWidth=0.5))
    return d


def _footer(canvas, doc, meta):
    canvas.saveState()
    canvas.setFont("Manrope", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 10 * mm, f"RUMO · {meta['workspace_name']} · {meta['period_label']} · gerado em {meta['generated_label']}")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"Página {doc.page}")
    canvas.restoreState()


def summary_pdf(payload: dict) -> bytes:
    """payload: workspace_name, period {from,to}, filters, summary (financial_summary), series (monthly_series),
    breakdown (category_breakdown expense), transactions (opcional), timezone."""
    tz = ZoneInfo(payload.get("timezone") or "America/Sao_Paulo")
    now = datetime.now(tz)
    period = payload["period"]
    pf = datetime.fromisoformat(period["from"]).strftime("%d/%m/%Y")
    pt = datetime.fromisoformat(period["to"]).strftime("%d/%m/%Y")
    meta = {"workspace_name": payload["workspace_name"], "period_label": f"{pf} a {pt}", "generated_label": now.strftime("%d/%m/%Y %H:%M %Z")}
    s = payload["summary"]

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=18 * mm,
                            title=f"RUMO — Relatório {meta['period_label']}", author="RUMO", subject=meta["workspace_name"])
    story: list = [_logo(), Spacer(1, 4 * mm), Paragraph("Relatório financeiro", H1),
                   Paragraph(_esc(f"Espaço: {meta['workspace_name']} · Período: {meta['period_label']} · Gerado em {meta['generated_label']}"), SMALL)]
    filters = payload.get("filters") or {}
    if filters:
        story.append(Paragraph(_esc("Filtros: " + "; ".join(f"{k}: {v}" for k, v in filters.items())), SMALL))
    story.append(Paragraph("Valores registrados pelo usuário (sem conexão bancária). Relatório gerencial; não é demonstração contábil.", SMALL))

    kpis = [("Receitas", int(s["income_cents"])), ("Despesas", int(s["expense_cents"])), ("Resultado", int(s["result_cents"])),
            ("Entradas de caixa", int(s["cash_in_cents"])), ("Saídas de caixa", int(s["cash_out_cents"])),
            ("Saldo no fim do período", int(s["balance_cents"])), ("A pagar (pendente)", int(s["pending_payable_cents"])),
            ("A receber (pendente)", int(s["pending_receivable_cents"]))]
    kt = LongTable([[Paragraph(k, CELL), Paragraph(f"<font color='{'#B42318' if v < 0 else '#14233B'}'>{fmt_brl(v)}</font>", CELL_R)] for k, v in kpis],
                   colWidths=[110 * mm, 64 * mm], hAlign="LEFT")
    kt.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.4, BORDER), ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                            ("BACKGROUND", (0, 2), (-1, 2), SOFT), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story += [Paragraph("Indicadores do período", H2), kt]

    series = payload.get("series") or []
    if series:
        story += [Paragraph("Receitas e despesas por mês", H2), _bar_chart(series)]
        st = [["Mês", "Receitas", "Despesas", "Resultado"]] + [
            [s_["month"][5:7] + "/" + s_["month"][:4] + ("" if s_.get("complete", True) else " (incompleto)"),
             fmt_brl(int(s_["income_cents"])), fmt_brl(int(s_["expense_cents"])),
             fmt_brl(int(s_["income_cents"]) - int(s_["expense_cents"]))] for s_ in series]
        t = LongTable(st, colWidths=[54 * mm, 40 * mm, 40 * mm, 40 * mm], repeatRows=1, hAlign="LEFT")
        t.setStyle(_table_style())
        story.append(t)

    bd = payload.get("breakdown") or []
    if bd:
        total = sum(int(b["amount_cents"]) for b in bd) or 1
        rows = [["Categoria", "Lançamentos", "Valor", "Participação"]] + [
            [Paragraph(_esc(b["name"]), CELL), str(b["count"]), fmt_brl(int(b["amount_cents"])),
             f"{int(b['amount_cents']) * 100 / total:.1f}%".replace(".", ",")] for b in bd]
        t = LongTable(rows, colWidths=[80 * mm, 28 * mm, 38 * mm, 28 * mm], repeatRows=1, hAlign="LEFT")
        t.setStyle(_table_style())
        story += [Paragraph("Despesas por categoria", H2), t]

    txs = payload.get("transactions") or []
    if txs:
        rows = [["Data", "Descrição", "Categoria", "Valor"]] + [
            [datetime.fromisoformat(x["date"]).strftime("%d/%m/%Y"), Paragraph(_esc(x["description"]), CELL),
             Paragraph(_esc(x.get("category") or "—"), CELL),
             Paragraph(f"<font color='{'#B42318' if x['kind'] != 'income' else '#14233B'}'>{fmt_brl(int(x['amount_cents']) * (1 if x['kind'] == 'income' else -1))}</font>", CELL_R)]
            for x in txs]
        t = LongTable(rows, colWidths=[22 * mm, 86 * mm, 34 * mm, 32 * mm], repeatRows=1, hAlign="LEFT")
        t.setStyle(_table_style())
        t.setStyle(TableStyle([("ALIGN", (0, 0), (2, -1), "LEFT")]))
        story += [Paragraph(f"Lançamentos ({len(txs)})", H2), t]

    story.append(KeepTogether([Paragraph("Como ler os indicadores", H2)] +
                              [Paragraph(f"<b>{_esc(k)}:</b> {_esc(v)}", BODY) for k, v in INDICATOR_HELP]))
    doc.build(story, onFirstPage=lambda c, d: _footer(c, d, meta), onLaterPages=lambda c, d: _footer(c, d, meta))
    return buf.getvalue()


def _table_style() -> TableStyle:
    return TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Manrope-Bold"), ("FONTNAME", (0, 1), (-1, -1), "Manrope"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), DEEP), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SOFT]),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LINEBELOW", (0, 0), (-1, -1), 0.3, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
    ])
