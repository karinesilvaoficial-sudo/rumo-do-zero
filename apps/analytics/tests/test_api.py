import io
import time

from openpyxl import load_workbook
from pypdf import PdfReader

SUMMARY = {"income_cents": "100000", "expense_cents": "25000", "result_cents": "75000", "cash_in_cents": "100000",
           "cash_out_cents": "25000", "balance_cents": "125000", "pending_payable_cents": "70000", "pending_receivable_cents": "0"}


def test_requires_service_signature(client, call):
    assert client.post("/v1/installments/split", json={"total_cents": "10000", "installments": 3}).status_code == 401
    assert call("/v1/installments/split", {"total_cents": "10000", "installments": 3}, ts=time.time() - 120).status_code == 401
    assert call("/v1/installments/split", {"total_cents": "10000", "installments": 3}, secret="wrong" * 10).status_code == 401
    assert call("/v1/installments/split", {"total_cents": "10000", "installments": 3}, tamper=True).status_code == 401


def test_split_endpoint(call):
    r = call("/v1/installments/split", {"total_cents": "10000", "installments": 3})
    assert r.status_code == 200 and r.json()["installments_cents"] == ["3333", "3333", "3334"]
    assert r.headers["cache-control"] == "no-store"


def test_rejects_float_money_and_extra_fields(call):
    assert call("/v1/installments/split", {"total_cents": 100.5, "installments": 3}).status_code == 422
    assert call("/v1/installments/split", {"total_cents": "100", "installments": 3, "admin": True}).status_code == 422


def test_debt_endpoint_incomplete(call):
    r = call("/v1/debts/simulate", {"outstanding_cents": "100000", "payment_cents": "10000"})
    assert r.json()["status"] == "incomplete" and r.json()["missing"] == ["monthly_rate"]


def test_pdf_is_real_and_consistent(call):
    txs = [{"date": "2026-11-%02d" % (1 + i % 28), "kind": "expense" if i % 3 else "income", "description": f"Lançamento ação nº {i} — pão & café",
            "category": "Alimentação", "amount_cents": str(1000 + i), "account": "Conta"} for i in range(400)]
    payload = {"workspace_name": "Pessoal Ana", "period": {"from": "2026-11-01", "to": "2026-11-30"}, "filters": {"Categoria": "Todas"},
               "summary": SUMMARY,
               "series": [{"month": "2026-10-01", "complete": True, "income_cents": "500000", "expense_cents": "-1" if False else "320000"},
                          {"month": "2026-11-01", "complete": False, "income_cents": "100000", "expense_cents": "25000"}],
               "breakdown": [{"name": "Alimentação", "amount_cents": "25000", "count": 2}], "transactions": txs}
    r = call("/v1/reports/pdf", payload)
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    reader = PdfReader(io.BytesIO(r.content))
    assert len(reader.pages) >= 5  # tabela longa paginada
    text = "".join(p.extract_text() for p in reader.pages)
    for needle in ("Relatório financeiro", "Pessoal Ana", "01/11/2026 a 30/11/2026", "R$ 750,00", "R$ 1.250,00", "Ação" if False else "ação nº 399",
                   "Como ler os indicadores", "Despesas por categoria", "11/2026 (incompleto)"):
        assert needle in text, needle
    fonts = {str(f) for p in reader.pages for f in (p["/Resources"].get("/Font") or {}).values()}
    assert reader.pages[0]["/Resources"]["/Font"]  # fontes incorporadas
    assert "Página 5" in text


def test_exports_typed_and_safe(call):
    rows = [{"date": "2026-11-05", "kind": "income", "description": "=HYPERLINK(\"http://evil\")", "category": "+cmd", "account": "Conta", "amount_cents": "100000"},
            {"date": "2026-11-06", "kind": "expense", "description": "Mercado", "category": "Alimentação", "account": "Conta", "amount_cents": "25050"}]
    base = {"workspace_name": "Pessoal", "period_label": "11/2026", "generated_at": "09/11/2026 10:00"}
    csv = call("/v1/exports", {**base, "format": "csv", "rows": rows}).content.decode("utf-8-sig")
    assert "'=HYPERLINK" in csv and ";'+cmd;" in csv and "-250,50" in csv and "1000,00" in csv
    x = call("/v1/exports", {**base, "format": "xlsx", "rows": rows})
    ws = load_workbook(io.BytesIO(x.content)).active
    assert ws["F3"].value == 1000 and ws["F4"].value == -250.5 and ws["F3"].data_type == "n"
    assert ws["C3"].data_type == "s" and ws["C3"].value.startswith("'=")
    assert ws["A3"].is_date
