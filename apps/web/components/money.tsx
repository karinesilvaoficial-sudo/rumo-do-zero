import { formatBRL, parseCents } from "@rumo/contracts";

/** Valor monetário com números tabulares, sinal textual e classe para o modo de privacidade. */
export function Money({ cents, signed, tone, className }: { cents: string | bigint | null | undefined; signed?: boolean; tone?: "auto" | "none"; className?: string }) {
  if (cents === null || cents === undefined) return <span className="muted" aria-label="valor não informado">—</span>;
  const v = typeof cents === "bigint" ? cents : parseCents(cents);
  const cls = tone === "auto" ? (v < 0n ? "neg" : v > 0n ? "pos" : "") : "";
  return <span className={`money ${cls} ${className ?? ""}`.trim()}>{formatBRL(v, { signed })}</span>;
}
