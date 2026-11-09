/**
 * "2,99" (% ao mês) → "0.0299" (fração decimal em texto), sem float.
 * Vazio → null (taxa desconhecida; nunca assumida zero). Inválido → undefined.
 */
export function percentToFraction(input: string | null | undefined): string | null | undefined {
  if (input === null || input === undefined || !input.trim()) return null;
  const m = input.replace("%", "").trim().replace(",", ".");
  if (!/^\d{1,2}(\.\d{1,6})?$/.test(m)) return undefined;
  const [i = "0", f = ""] = m.split(".");
  const micro = BigInt(i) * 1_000_000n + BigInt((f + "000000").slice(0, 6)); // percentual × 10^6
  if (micro >= 100_000_000n) return undefined; // ≥ 100% a.m.
  const s = micro.toString().padStart(8, "0").replace(/0+$/, "");
  return s ? `0.${s}` : "0";
}
