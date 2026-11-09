/**
 * Dinheiro no RUMO: centavos inteiros. No fio (JSON) trafegam como string ("12345" = R$ 123,45).
 * No navegador/servidor usamos bigint para somas e conversões; nunca float binário em somas.
 */
export const MAX_ABS_CENTS = 10_000_000_000_000n;

export function parseCents(value: unknown): bigint {
  if (typeof value === "bigint") return checkRange(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("cents_unsafe_number");
    return checkRange(BigInt(value));
  }
  if (typeof value === "string" && /^-?\d{1,18}$/.test(value)) return checkRange(BigInt(value));
  throw new Error("cents_invalid");
}

function checkRange(v: bigint): bigint {
  if (v > MAX_ABS_CENTS * 1000n || v < -MAX_ABS_CENTS * 1000n) throw new Error("cents_out_of_range");
  return v;
}

/** Converte texto digitado em pt-BR ("1.234,56", "1234,5", "R$ 10") para centavos, sem float. */
export function parseBRLInput(text: string): bigint | null {
  const s = text.replace(/R\$\s?/i, "").replace(/\s/g, "").trim();
  if (!s) return null;
  const neg = s.startsWith("-") || s.startsWith("−");
  const body = s.replace(/^[-−]/, "");
  if (!/^(\d{1,3}(\.\d{3})*|\d+)(,\d{1,2})?$/.test(body)) return null;
  const [intPart = "0", frac = ""] = body.replace(/\./g, "").split(",");
  const cents = BigInt(intPart) * 100n + BigInt((frac + "00").slice(0, 2));
  return neg ? -cents : cents;
}

export function formatBRL(cents: bigint | string, opts: { signed?: boolean } = {}): string {
  const v = typeof cents === "bigint" ? cents : parseCents(cents);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const reais = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const c = (abs % 100n).toString().padStart(2, "0");
  const sign = neg ? "−" : opts.signed && v > 0n ? "+" : "";
  return `${sign}R$ ${reais},${c}`;
}

/** Fala natural para TTS: "R$ 1.234,56" → "mil duzentos e trinta e quatro reais e cinquenta e seis centavos" (simplificada por números). */
export function centsToSpeech(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const reais = abs / 100n;
  const c = abs % 100n;
  const r = reais === 1n ? "1 real" : `${reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} reais`;
  const parts = reais > 0n || c === 0n ? [r] : [];
  if (c > 0n) parts.push(c === 1n ? "1 centavo" : `${c} centavos`);
  return (neg ? "menos " : "") + parts.join(" e ");
}

export function sumCents(values: Array<bigint | string>): bigint {
  return values.reduce<bigint>((acc, v) => acc + (typeof v === "bigint" ? v : parseCents(v)), 0n);
}

/** Apenas para escala de gráfico (nunca para somar/armazenar). */
export function centsToChartNumber(cents: bigint | string): number {
  const v = typeof cents === "bigint" ? cents : parseCents(cents);
  return Number(v) / 100;
}
