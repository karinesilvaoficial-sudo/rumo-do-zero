"""Representação monetária.

* Centavos trafegam como string de inteiro ("12345" = R$ 123,45) para não perder precisão em JSON.
* Internamente usamos int (centavos) e Decimal para taxas e frações.
* Arredondamento: ROUND_HALF_UP para centavos (prática comercial brasileira), documentado em docs/politica-financeira.md.
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation, getcontext

getcontext().prec = 34  # precisão decimal128

MAX_ABS_CENTS = 10_000_000_000_000  # R$ 100 bilhões (mesmo teto do banco)
CENT = Decimal(1)


def parse_cents(value: str | int, *, allow_negative: bool = True) -> int:
    if isinstance(value, bool):
        raise ValueError("cents_invalid")
    if isinstance(value, int):
        n = value
    else:
        s = str(value).strip()
        if not s or not (s.lstrip("-").isdigit()) or len(s) > 18:
            raise ValueError("cents_invalid")
        n = int(s)
    if abs(n) > MAX_ABS_CENTS * 1000:
        raise ValueError("cents_out_of_range")
    if not allow_negative and n < 0:
        raise ValueError("cents_negative")
    return n


def parse_rate(value: str | None) -> Decimal | None:
    """Taxa como fração decimal em string ("0.0299" = 2,99% a.m.). None = desconhecida (nunca zero)."""
    if value is None:
        return None
    try:
        d = Decimal(str(value))
    except InvalidOperation as e:  # pragma: no cover - validação defensiva
        raise ValueError("rate_invalid") from e
    if not d.is_finite() or d < 0 or d >= 1:
        raise ValueError("rate_out_of_range")
    return d


def round_cents(value: Decimal) -> int:
    return int(value.quantize(CENT, rounding=ROUND_HALF_UP))


def fmt_brl(cents: int) -> str:
    """Formata centavos como R$ 1.234,56 (sinal preservado)."""
    sign = "−" if cents < 0 else ""
    c = abs(cents)
    reais, cent = divmod(c, 100)
    inteiro = f"{reais:,}".replace(",", ".")
    return f"{sign}R$ {inteiro},{cent:02d}"


def to_str(cents: int) -> str:
    return str(int(cents))
