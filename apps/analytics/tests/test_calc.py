from datetime import date
from decimal import Decimal

import pytest

from rumo_analytics import calc
from rumo_analytics.money import fmt_brl, parse_cents, parse_rate


def test_split_100_in_3():
    assert calc.split_installments(10000, 3) == [3333, 3333, 3334]
    assert sum(calc.split_installments(10000, 3)) == 10000


@pytest.mark.parametrize("total,n", [(1, 1), (99999, 7), (10_000_000_000_00, 48), (47, 47)])
def test_split_preserves_total(total, n):
    parts = calc.split_installments(total, n)
    assert sum(parts) == total and len(parts) == n and max(parts) - min(parts) < n


def test_debt_unknown_rate_is_incomplete_not_zero():
    r = calc.simulate_debt(100000, None, 10000)
    assert r.status == "incomplete" and r.missing == ["monthly_rate"] and r.total_interest_cents is None


def test_debt_zero_rate_only_when_informed():
    r = calc.simulate_debt(100000, Decimal("0"), 25000)
    assert r.status == "ok" and r.months == 4 and r.total_interest_cents == 0


def test_debt_amortization_exact():
    r = calc.simulate_debt(100000, Decimal("0.02"), 50000)
    # m1: juros 2000, principal 48000, saldo 52000; m2: juros 1040, principal 48960, saldo 3040; m3: juros 60.8→61, paga 3101
    assert [s["interest_cents"] for s in r.schedule] == [2000, 1040, 61]
    assert r.total_paid_cents == 100000 + 2000 + 1040 + 61
    assert r.schedule[-1]["balance_cents"] == 0


def test_debt_never_pays_off():
    assert calc.simulate_debt(100000, Decimal("0.05"), 5000).status == "never_pays_off"


def test_payoff_avalanche_vs_snowball_and_incomplete():
    debts = [
        {"id": "a", "outstanding_cents": 500000, "monthly_rate": Decimal("0.03"), "min_payment_cents": 20000},
        {"id": "b", "outstanding_cents": 100000, "monthly_rate": Decimal("0.01"), "min_payment_cents": 10000},
    ]
    av = calc.payoff_plan(debts, 80000, "avalanche")
    sb = calc.payoff_plan(debts, 80000, "snowball")
    assert av["status"] == sb["status"] == "ok"
    assert av["total_interest_cents"] <= sb["total_interest_cents"]
    assert sb["order"][0]["id"] == "b"
    assert calc.payoff_plan([{**debts[0], "monthly_rate": None}], 80000, "avalanche")["status"] == "incomplete"
    assert calc.payoff_plan(debts, 1000, "avalanche")["status"] == "insufficient_budget"


def test_goal_plan():
    r = calc.goal_plan(1200000, 200000, date(2026, 11, 9), date(2027, 11, 9), 50000)
    assert r["months_left"] == 12 and r["required_monthly_cents"] == 83334 and r["months_to_reach"] == 20
    assert r["reach_date"] == "2028-07-09"


def test_business_metrics_missing_data_not_zero():
    r = calc.business_metrics(revenue=1000000, variable_costs=None, fixed_costs=300000, unit_price=None, unit_cost=None, owner_withdrawals=50000)
    assert r["contribution_margin_cents"] is None and r["breakeven_revenue_cents"] is None
    assert r["missing"]["contribution_margin"] == ["variable_costs"]
    assert r["owner_withdrawals_cents"] == 50000


def test_business_metrics_margin_vs_markup():
    r = calc.business_metrics(1000000, 400000, 300000, 15000, 10000, None)
    assert r["contribution_margin_cents"] == 600000 and r["contribution_margin_ratio"] == "0.6000"
    assert r["operating_result_cents"] == 300000 and r["breakeven_revenue_cents"] == 500000
    assert r["markup"] == "0.5000" and r["margin_on_price"] == "0.3333"


def test_business_division_by_zero():
    r = calc.business_metrics(0, 0, 100, 0, 0, None)
    assert r["contribution_margin_ratio"] is None and r["markup"] is None and r["breakeven_revenue_cents"] is None


def test_projection_uses_only_complete_months():
    hist = [{"month": "2026-09-01", "complete": True, "income_cents": "500000", "expense_cents": "300000"},
            {"month": "2026-10-01", "complete": True, "income_cents": "500000", "expense_cents": "400000"},
            {"month": "2026-11-01", "complete": False, "income_cents": "10", "expense_cents": "999999"}]
    r = calc.cash_projection(100000, hist, [{"month": "2026-12-01", "direction": "payable", "pending_cents": "50000"}], 2, date(2026, 12, 1))
    c = r["scenarios"]["central"]["rows"]
    assert r["assumptions"]["base_months"] == 2 and r["assumptions"]["avg_expense_cents"] == 350000
    assert c[0]["balance_cents"] == 100000 + 500000 - 350000 - 50000
    assert r["scenarios"]["conservative"]["rows"][0]["balance_cents"] < c[0]["balance_cents"] < r["scenarios"]["optimistic"]["rows"][0]["balance_cents"]
    assert calc.cash_projection(0, hist[2:], [], 3, date(2026, 12, 1))["status"] == "incomplete"


def test_money_helpers():
    assert fmt_brl(123456789) == "R$ 1.234.567,89" and fmt_brl(-5) == "−R$ 0,05"
    assert parse_cents("9007199254740993") == 9007199254740993  # acima de 2^53 sem perda
    assert parse_rate(None) is None
    with pytest.raises(ValueError):
        parse_cents("1.5")
    with pytest.raises(ValueError):
        parse_rate("1.2")
