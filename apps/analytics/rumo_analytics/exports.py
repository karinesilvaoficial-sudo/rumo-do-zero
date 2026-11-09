"""CSV e XLSX com números tipados e proteção contra injeção de fórmulas em células de texto."""
from __future__ import annotations

import csv
import io
from datetime import date
from decimal import Decimal

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

DANGEROUS_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "\n", "|", "%")


def safe_text(value: str | None) -> str:
    s = "" if value is None else str(value)
    if s and s[0] in DANGEROUS_PREFIXES:
        return "'" + s
    return s


COLUMNS = [("date", "Data"), ("kind", "Tipo"), ("description", "Descrição"), ("category", "Categoria"),
           ("account", "Conta"), ("amount_cents", "Valor (R$)"), ("status", "Situação")]
KIND_LABEL = {"income": "Receita", "expense": "Despesa", "transfer": "Transferência", "card_purchase": "Compra no cartão",
              "card_charge": "Encargo do cartão", "card_payment": "Pagamento de fatura", "debt_payment": "Amortização de dívida"}


def _signed(row: dict) -> int:
    """Sinal na exportação: receita +, saídas −, transferência 0-neutra (valor informado positivo)."""
    c = int(row["amount_cents"])
    return c if row["kind"] in ("income", "transfer") else -c


def to_csv(rows: list[dict]) -> bytes:
    """CSV pt-BR: separador ';', decimal ',', UTF-8 com BOM (abre corretamente no Excel)."""
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";", quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    w.writerow([label for _, label in COLUMNS])
    for r in rows:
        cents = _signed(r)
        reais = f"{Decimal(cents) / 100:.2f}".replace(".", ",")
        w.writerow([r["date"], KIND_LABEL.get(r["kind"], r["kind"]), safe_text(r.get("description")), safe_text(r.get("category")),
                    safe_text(r.get("account")), reais, safe_text(r.get("status"))])
    return ("﻿" + buf.getvalue()).encode("utf-8")


def to_xlsx(rows: list[dict], meta: dict) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Lançamentos"
    ws.append([f"RUMO · {meta.get('workspace_name', '')} · {meta.get('period', '')} · gerado em {meta.get('generated_at', '')}"])
    ws["A1"].font = Font(bold=True)
    ws.append([label for _, label in COLUMNS])
    for c in ws[2]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1F57FF")
    for r in rows:
        cents = _signed(r)
        ws.append([date.fromisoformat(r["date"]), KIND_LABEL.get(r["kind"], r["kind"]), safe_text(r.get("description")),
                   safe_text(r.get("category")), safe_text(r.get("account")), Decimal(cents) / 100, safe_text(r.get("status"))])
        ws.cell(row=ws.max_row, column=1).number_format = "DD/MM/YYYY"
        ws.cell(row=ws.max_row, column=6).number_format = '"R$" #,##0.00;[Red]-"R$" #,##0.00'
        for col in (3, 4, 5, 7):
            ws.cell(row=ws.max_row, column=col).data_type = "s"
    for col, width in zip("ABCDEFG", (12, 20, 40, 20, 20, 16, 14)):
        ws.column_dimensions[col].width = width
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
