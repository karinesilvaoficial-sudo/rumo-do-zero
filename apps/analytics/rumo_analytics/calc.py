"""Cálculos financeiros determinísticos. A IA explica estes resultados; não os calcula."""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from .money import round_cents

MAX_MONTHS = 600


# ---------------------------------------------------------------------------
# Parcelamento
# ---------------------------------------------------------------------------
def split_installments(total_cents: int, n: int) -> list[int]:
    """Parcelas iguais (piso) e resíduo na última. Soma preservada exatamente."""
    if n < 1 or n > 48:
        raise ValueError("installments_out_of_range")
    if total_cents < n:
        raise ValueError("amount_too_small")
    base = total_cents // n
    parts = [base] * (n - 1) + [total_cents - base * (n - 1)]
    assert sum(parts) == total_cents
    return parts


def add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


# ---------------------------------------------------------------------------
# Dívidas
# ---------------------------------------------------------------------------
@dataclass
class DebtResult:
    status: str  # "ok" | "incomplete" | "never_pays_off"
    missing: list[str]
    months: int | None = None
    total_interest_cents: int | None = None
    total_paid_cents: int | None = None
    schedule: list[dict] | None = None


def simulate_debt(outstanding_cents: int, monthly_rate: Decimal | None, payment_cents: int | None) -> DebtResult:
    """Amortização mês a mês: juros = saldo × taxa (arredondado ao centavo, HALF_UP), pagamento abate juros e depois principal.
    Taxa ausente NÃO é tratada como zero: resultado 'incomplete'."""
    missing = []
    if monthly_rate is None:
        missing.append("monthly_rate")
    if payment_cents is None:
        missing.append("payment_cents")
    if missing:
        return DebtResult(status="incomplete", missing=missing)
    assert monthly_rate is not None and payment_cents is not None
    balance = outstanding_cents
    total_interest = 0
    total_paid = 0
    schedule = []
    for month in range(1, MAX_MONTHS + 1):
        if balance <= 0:
            break
        interest = round_cents(Decimal(balance) * monthly_rate)
        if payment_cents <= interest:
            return DebtResult(status="never_pays_off", missing=[], schedule=[{"month": 1, "interest_cents": interest, "payment_cents": payment_cents}])
        pay = min(payment_cents, balance + interest)
        principal = pay - interest
        balance -= principal
        total_interest += interest
        total_paid += pay
        schedule.append({"month": month, "payment_cents": pay, "interest_cents": interest, "principal_cents": principal, "balance_cents": balance})
    if balance > 0:
        return DebtResult(status="never_pays_off", missing=[])
    return DebtResult(status="ok", missing=[], months=len(schedule), total_interest_cents=total_interest, total_paid_cents=total_paid, schedule=schedule)


def payoff_plan(debts: list[dict], monthly_budget_cents: int, strategy: str) -> dict:
    """Plano de quitação com orçamento mensal único.
    avalanche: maior taxa primeiro (exige todas as taxas); snowball: menor saldo primeiro.
    Cada dívida recebe o pagamento mínimo informado; o excedente vai para a prioritária."""
    unknown = [d["id"] for d in debts if d.get("monthly_rate") is None]
    if unknown:
        return {"status": "incomplete", "missing": [f"monthly_rate:{i}" for i in unknown]}
    no_min = [d["id"] for d in debts if d.get("min_payment_cents") is None]
    if no_min:
        return {"status": "incomplete", "missing": [f"min_payment_cents:{i}" for i in no_min]}
    mins = sum(d["min_payment_cents"] for d in debts)
    if monthly_budget_cents < mins:
        return {"status": "insufficient_budget", "missing": [], "required_min_cents": mins}
    state = [{**d, "balance": d["outstanding_cents"], "interest": 0, "paid_off_month": None} for d in debts]
    key = (lambda s: (-s["monthly_rate"], s["balance"])) if strategy == "avalanche" else (lambda s: (s["balance"], -s["monthly_rate"]))
    month = 0
    while any(s["balance"] > 0 for s in state) and month < MAX_MONTHS:
        month += 1
        budget = monthly_budget_cents
        for s in state:
            if s["balance"] > 0:
                i = round_cents(Decimal(s["balance"]) * s["monthly_rate"])
                s["balance"] += i
                s["interest"] += i
        for s in state:
            if s["balance"] > 0:
                p = min(s["min_payment_cents"], s["balance"], budget)
                s["balance"] -= p
                budget -= p
        for s in sorted([s for s in state if s["balance"] > 0], key=key):
            p = min(s["balance"], budget)
            s["balance"] -= p
            budget -= p
        for s in state:
            if s["balance"] == 0 and s["paid_off_month"] is None:
                s["paid_off_month"] = month
    if any(s["balance"] > 0 for s in state):
        return {"status": "never_pays_off", "missing": []}
    return {
        "status": "ok", "missing": [], "strategy": strategy, "months": month,
        "total_interest_cents": sum(s["interest"] for s in state),
        "order": [{"id": s["id"], "paid_off_month": s["paid_off_month"], "interest_cents": s["interest"]}
                  for s in sorted(state, key=lambda s: s["paid_off_month"])],
    }


# ---------------------------------------------------------------------------
# Metas
# ---------------------------------------------------------------------------
def months_between(start: date, end: date) -> int:
    """Meses completos entre duas datas (mínimo 0)."""
    m = (end.year - start.year) * 12 + (end.month - start.month)
    if end.day < start.day:
        m -= 1
    return max(m, 0)


def goal_plan(target_cents: int, saved_cents: int, today: date, target_date: date | None, monthly_contribution_cents: int | None) -> dict:
    remaining = max(target_cents - saved_cents, 0)
    out: dict = {"remaining_cents": remaining, "progress_ratio": str((Decimal(min(saved_cents, target_cents)) / Decimal(target_cents)).quantize(Decimal("0.0001")))}
    if target_date is not None:
        months = months_between(today, target_date)
        out["months_left"] = months
        out["required_monthly_cents"] = None if months == 0 else -(-remaining // months)  # teto
        if months == 0 and remaining > 0:
            out["note"] = "prazo_vencido_ou_no_mes_atual"
    if monthly_contribution_cents:
        n = -(-remaining // monthly_contribution_cents)
        out["months_to_reach"] = n
        out["reach_date"] = add_months(today, n).isoformat()
    return out


# ---------------------------------------------------------------------------
# Negócio: fórmulas nomeadas, denominadores explícitos, sem inventar dados
# ---------------------------------------------------------------------------
def _ratio(num: int | None, den: int | None) -> Decimal | None:
    if num is None or den is None or den == 0:
        return None
    return (Decimal(num) / Decimal(den)).quantize(Decimal("0.0001"))


def business_metrics(revenue: int | None, variable_costs: int | None, fixed_costs: int | None,
                     unit_price: int | None, unit_cost: int | None, owner_withdrawals: int | None) -> dict:
    missing: dict[str, list[str]] = {}
    cm = None if revenue is None or variable_costs is None else revenue - variable_costs
    if cm is None:
        missing["contribution_margin"] = [k for k, v in (("revenue", revenue), ("variable_costs", variable_costs)) if v is None]
    cm_ratio = _ratio(cm, revenue)
    result = None if cm is None or fixed_costs is None else cm - fixed_costs
    if result is None:
        missing["operating_result"] = [k for k, v in (("revenue", revenue), ("variable_costs", variable_costs), ("fixed_costs", fixed_costs)) if v is None]
    breakeven = None
    if fixed_costs is not None and cm_ratio is not None and cm_ratio > 0:
        breakeven = round_cents(Decimal(fixed_costs) / cm_ratio)
    elif fixed_costs is None or cm_ratio is None:
        missing["breakeven_revenue"] = ["fixed_costs" if fixed_costs is None else "contribution_margin_ratio"]
    markup = _ratio(None if unit_price is None or unit_cost is None else unit_price - unit_cost, unit_cost)
    margin_on_price = _ratio(None if unit_price is None or unit_cost is None else unit_price - unit_cost, unit_price)
    if unit_price is None or unit_cost is None:
        missing["unit_pricing"] = [k for k, v in (("unit_price", unit_price), ("unit_cost", unit_cost)) if v is None]
    return {
        "formulas": {
            "contribution_margin": "receita − custos variáveis",
            "contribution_margin_ratio": "margem de contribuição ÷ receita",
            "operating_result": "margem de contribuição − custos fixos (gerencial simplificado; retiradas de sócio à parte)",
            "breakeven_revenue": "custos fixos ÷ índice de margem de contribuição",
            "markup": "(preço − custo unitário) ÷ custo unitário",
            "margin_on_price": "(preço − custo unitário) ÷ preço",
        },
        "contribution_margin_cents": cm,
        "contribution_margin_ratio": None if cm_ratio is None else str(cm_ratio),
        "operating_result_cents": result,
        "breakeven_revenue_cents": breakeven,
        "markup": None if markup is None else str(markup),
        "margin_on_price": None if margin_on_price is None else str(margin_on_price),
        "owner_withdrawals_cents": owner_withdrawals,  # não é venda nem despesa operacional
        "missing": missing,
        "disclaimer": "Relatório gerencial simplificado com dados informados pelo usuário; não é demonstração contábil.",
    }


# ---------------------------------------------------------------------------
# Projeção de caixa com cenários (hipóteses editáveis, não promessas)
# ---------------------------------------------------------------------------
DEFAULT_SCENARIOS = {
    "conservative": {"income_factor": "0.90", "expense_factor": "1.10"},
    "central": {"income_factor": "1.00", "expense_factor": "1.00"},
    "optimistic": {"income_factor": "1.05", "expense_factor": "0.95"},
}


def cash_projection(start_balance_cents: int, history: list[dict], scheduled: list[dict], months: int,
                    start_month: date, scenarios: dict[str, dict] | None = None) -> dict:
    """history: [{month, complete, income_cents, expense_cents}] — só meses completos entram na média.
    scheduled: compromissos conhecidos [{month: 'YYYY-MM-01', direction, pending_cents}] somados ao cenário.
    A base recorrente é a média dos meses completos; compromissos já agendados aparecem explicitamente."""
    if months < 1 or months > 24:
        raise ValueError("months_out_of_range")
    complete = [h for h in history if h.get("complete")]
    if not complete:
        return {"status": "incomplete", "missing": ["history_complete_months"], "assumptions": {}}
    avg_in = Decimal(sum(int(h["income_cents"]) for h in complete)) / len(complete)
    avg_out = Decimal(sum(int(h["expense_cents"]) for h in complete)) / len(complete)
    sched: dict[str, int] = {}
    for s in scheduled:
        sign = 1 if s["direction"] == "receivable" else -1
        sched[s["month"]] = sched.get(s["month"], 0) + sign * int(s["pending_cents"])
    scen = scenarios or DEFAULT_SCENARIOS
    out = {}
    for name, f in scen.items():
        fi, fe = Decimal(str(f["income_factor"])), Decimal(str(f["expense_factor"]))
        bal = start_balance_cents
        rows = []
        for i in range(months):
            m = add_months(start_month.replace(day=1), i)
            inc = round_cents(avg_in * fi)
            exp = round_cents(avg_out * fe)
            known = sched.get(m.isoformat(), 0)
            bal = bal + inc - exp + known
            rows.append({"month": m.isoformat(), "income_cents": inc, "expense_cents": exp, "scheduled_net_cents": known, "balance_cents": bal})
        out[name] = {"factors": {"income_factor": str(fi), "expense_factor": str(fe)}, "rows": rows}
    return {
        "status": "ok", "missing": [], "kind": "simulated",
        "assumptions": {
            "base_months": len(complete),
            "avg_income_cents": round_cents(avg_in),
            "avg_expense_cents": round_cents(avg_out),
            "rounding": "ROUND_HALF_UP ao centavo",
            "note": "Cenários são hipóteses editáveis, não promessas de resultado.",
        },
        "scenarios": out,
    }
