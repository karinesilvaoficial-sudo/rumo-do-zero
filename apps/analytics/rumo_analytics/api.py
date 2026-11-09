"""API FastAPI. Contratos em packages/contracts/openapi/analytics.json (gerado por scripts/export_openapi.py)."""
from __future__ import annotations

import logging
from datetime import date
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import calc, exports, pdf
from .money import parse_cents, parse_rate
from .security import ServiceContext, verify

log = logging.getLogger("rumo.analytics")

app = FastAPI(title="RUMO Analytics", version="0.1.0", docs_url=None, redoc_url=None)

Cents = Annotated[str, Field(pattern=r"^-?\d{1,16}$", description="Centavos como string de inteiro")]
OptCents = Annotated[str | None, Field(default=None, pattern=r"^-?\d{1,16}$")]
Rate = Annotated[str | None, Field(default=None, pattern=r"^0(\.\d{1,8})?$", description="Fração mensal, ex.: 0.0299")]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


@app.exception_handler(ValueError)
async def value_error(_: Request, exc: ValueError):
    return JSONResponse(status_code=422, content={"error": str(exc)})


@app.middleware("http")
async def no_store(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


@app.get("/health")
def health():
    return {"status": "ok", "service": "rumo-analytics"}


Ctx = Annotated[ServiceContext, Depends(verify)]


# --- Parcelas -----------------------------------------------------------------
class SplitIn(Strict):
    total_cents: Cents
    installments: int = Field(ge=1, le=48)


@app.post("/v1/installments/split")
def split(body: SplitIn, ctx: Ctx):
    parts = calc.split_installments(parse_cents(body.total_cents, allow_negative=False), body.installments)
    return {"installments_cents": [str(p) for p in parts], "rule": "parcelas iguais (piso); resíduo na última"}


# --- Dívidas ------------------------------------------------------------------
class DebtIn(Strict):
    outstanding_cents: Cents
    monthly_rate: Rate = None
    payment_cents: OptCents = None


@app.post("/v1/debts/simulate")
def debt_sim(body: DebtIn, ctx: Ctx):
    r = calc.simulate_debt(parse_cents(body.outstanding_cents, allow_negative=False), parse_rate(body.monthly_rate),
                           None if body.payment_cents is None else parse_cents(body.payment_cents, allow_negative=False))
    return {"status": r.status, "missing": r.missing, "months": r.months,
            "total_interest_cents": None if r.total_interest_cents is None else str(r.total_interest_cents),
            "total_paid_cents": None if r.total_paid_cents is None else str(r.total_paid_cents),
            "schedule": [{k: (str(v) if k.endswith("_cents") else v) for k, v in row.items()} for row in (r.schedule or [])],
            "assumptions": {"rounding": "juros mensais arredondados ao centavo (ROUND_HALF_UP)", "rate_basis": "taxa mensal informada pelo usuário"}}


class PayoffDebt(Strict):
    id: str = Field(max_length=64)
    outstanding_cents: Cents
    monthly_rate: Rate = None
    min_payment_cents: OptCents = None


class PayoffIn(Strict):
    debts: list[PayoffDebt] = Field(min_length=1, max_length=50)
    monthly_budget_cents: Cents
    strategy: Literal["avalanche", "snowball"]


@app.post("/v1/debts/payoff")
def debt_payoff(body: PayoffIn, ctx: Ctx):
    debts = [{"id": d.id, "outstanding_cents": parse_cents(d.outstanding_cents, allow_negative=False),
              "monthly_rate": parse_rate(d.monthly_rate),
              "min_payment_cents": None if d.min_payment_cents is None else parse_cents(d.min_payment_cents, allow_negative=False)} for d in body.debts]
    r = calc.payoff_plan(debts, parse_cents(body.monthly_budget_cents, allow_negative=False), body.strategy)
    return _stringify(r)


# --- Metas --------------------------------------------------------------------
class GoalIn(Strict):
    target_cents: Cents
    saved_cents: Cents
    today: date
    target_date: date | None = None
    monthly_contribution_cents: OptCents = None


@app.post("/v1/goals/plan")
def goal(body: GoalIn, ctx: Ctx):
    target = parse_cents(body.target_cents, allow_negative=False)
    if target == 0:
        raise HTTPException(status_code=422, detail="target_zero")
    r = calc.goal_plan(target, parse_cents(body.saved_cents), body.today, body.target_date,
                       None if body.monthly_contribution_cents is None else parse_cents(body.monthly_contribution_cents, allow_negative=False))
    return _stringify(r)


# --- Negócio ------------------------------------------------------------------
class BusinessIn(Strict):
    revenue_cents: OptCents = None
    variable_costs_cents: OptCents = None
    fixed_costs_cents: OptCents = None
    unit_price_cents: OptCents = None
    unit_cost_cents: OptCents = None
    owner_withdrawals_cents: OptCents = None


def _opt(v: str | None) -> int | None:
    return None if v is None else parse_cents(v)


@app.post("/v1/business/metrics")
def business(body: BusinessIn, ctx: Ctx):
    return _stringify(calc.business_metrics(_opt(body.revenue_cents), _opt(body.variable_costs_cents), _opt(body.fixed_costs_cents),
                                            _opt(body.unit_price_cents), _opt(body.unit_cost_cents), _opt(body.owner_withdrawals_cents)))


# --- Projeção -----------------------------------------------------------------
class HistoryMonth(Strict):
    month: date
    complete: bool
    income_cents: Cents
    expense_cents: Cents


class Scheduled(Strict):
    month: date
    direction: Literal["payable", "receivable"]
    pending_cents: Cents


class ScenarioFactors(Strict):
    income_factor: Annotated[str, Field(pattern=r"^\d(\.\d{1,4})?$")]
    expense_factor: Annotated[str, Field(pattern=r"^\d(\.\d{1,4})?$")]


class ProjectionIn(Strict):
    start_balance_cents: Cents
    start_month: date
    months: int = Field(ge=1, le=24)
    history: list[HistoryMonth] = Field(max_length=36)
    scheduled: list[Scheduled] = Field(default_factory=list, max_length=2000)
    scenarios: dict[Literal["conservative", "central", "optimistic", "custom"], ScenarioFactors] | None = None

    @field_validator("start_month")
    @classmethod
    def first_day(cls, v: date) -> date:
        return v.replace(day=1)


@app.post("/v1/projections/cash")
def projection(body: ProjectionIn, ctx: Ctx):
    r = calc.cash_projection(
        parse_cents(body.start_balance_cents),
        [{"month": h.month.isoformat(), "complete": h.complete, "income_cents": h.income_cents, "expense_cents": h.expense_cents} for h in body.history],
        [{"month": s.month.replace(day=1).isoformat(), "direction": s.direction, "pending_cents": s.pending_cents} for s in body.scheduled],
        body.months, body.start_month,
        None if body.scenarios is None else {k: v.model_dump() for k, v in body.scenarios.items()})
    return _stringify(r)


# --- Documentos ---------------------------------------------------------------
class Period(Strict):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    from_: date = Field(alias="from")
    to: date


class SummaryData(BaseModel):
    income_cents: Cents
    expense_cents: Cents
    result_cents: Cents
    cash_in_cents: Cents
    cash_out_cents: Cents
    balance_cents: Cents
    pending_payable_cents: Cents
    pending_receivable_cents: Cents


class SeriesMonth(BaseModel):
    month: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    complete: bool = True
    income_cents: Cents
    expense_cents: Cents


class BreakdownRow(BaseModel):
    name: str = Field(max_length=80)
    amount_cents: Cents
    count: int


class TxRow(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    kind: Literal["income", "expense", "transfer", "card_purchase", "card_charge", "card_payment", "debt_payment"]
    description: str = Field(max_length=200)
    category: str | None = Field(default=None, max_length=80)
    account: str | None = Field(default=None, max_length=80)
    amount_cents: Cents
    status: str | None = Field(default=None, max_length=40)


class ReportIn(Strict):
    workspace_name: str = Field(max_length=80)
    timezone: str = Field(default="America/Sao_Paulo", pattern=r"^[A-Za-z_]+(/[A-Za-z_]+){0,2}$")
    period: Period
    filters: dict[str, str] = Field(default_factory=dict, max_length=10)
    summary: SummaryData
    series: list[SeriesMonth] = Field(default_factory=list, max_length=36)
    breakdown: list[BreakdownRow] = Field(default_factory=list, max_length=200)
    transactions: list[TxRow] = Field(default_factory=list, max_length=5000)


@app.post("/v1/reports/pdf")
def report_pdf(body: ReportIn, ctx: Ctx):
    payload = body.model_dump(by_alias=True)
    payload["period"] = {"from": body.period.from_.isoformat(), "to": body.period.to.isoformat()}
    data = pdf.summary_pdf(payload)
    return Response(content=data, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="rumo-relatorio.pdf"'})


class ExportIn(Strict):
    format: Literal["csv", "xlsx"]
    workspace_name: str = Field(max_length=80)
    period_label: str = Field(max_length=60)
    generated_at: str = Field(max_length=40)
    rows: list[TxRow] = Field(max_length=50000)


@app.post("/v1/exports")
def export(body: ExportIn, ctx: Ctx):
    rows = [r.model_dump() for r in body.rows]
    if body.format == "csv":
        return Response(content=exports.to_csv(rows), media_type="text/csv; charset=utf-8")
    data = exports.to_xlsx(rows, {"workspace_name": body.workspace_name, "period": body.period_label, "generated_at": body.generated_at})
    return Response(content=data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


def _stringify(o):
    """Converte inteiros em campos *_cents para string (contrato monetário)."""
    if isinstance(o, dict):
        return {k: (str(v) if k.endswith("_cents") and isinstance(v, int) and not isinstance(v, bool) else _stringify(v)) for k, v in o.items()}
    if isinstance(o, list):
        return [_stringify(x) for x in o]
    return o
