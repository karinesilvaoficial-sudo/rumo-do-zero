/** Períodos de análise. Datas de negócio no fuso do espaço (padrão America/Sao_Paulo). */
export type PeriodKey = "mes" | "mes-anterior" | "3m" | "12m" | "ano" | "custom";
export type Period = { key: PeriodKey; from: string; to: string; label: string };

export function todayIn(tz = "America/Sao_Paulo", now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function ymd(y: number, m: number, d: number) {
  const dt = new Date(Date.UTC(y, m, d));
  return dt.toISOString().slice(0, 10);
}
function lastDay(y: number, m: number) {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function resolvePeriod(key: string | undefined, from?: string, to?: string, tz = "America/Sao_Paulo", now = new Date()): Period {
  const t = todayIn(tz, now);
  const [y, m] = [Number(t.slice(0, 4)), Number(t.slice(5, 7)) - 1];
  switch (key) {
    case "mes-anterior": {
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      return { key: "mes-anterior", from: ymd(py, pm, 1), to: ymd(py, pm, lastDay(py, pm)), label: "Mês anterior" };
    }
    case "3m":
      return { key: "3m", from: ymd(y, m - 2, 1), to: ymd(y, m, lastDay(y, m)), label: "Últimos 3 meses" };
    case "12m":
      return { key: "12m", from: ymd(y, m - 11, 1), to: ymd(y, m, lastDay(y, m)), label: "Últimos 12 meses" };
    case "ano":
      return { key: "ano", from: ymd(y, 0, 1), to: ymd(y, 11, 31), label: `Ano de ${y}` };
    case "custom":
      if (from && to && ISO.test(from) && ISO.test(to) && from <= to) {
        return { key: "custom", from, to, label: `${fmtDate(from)} a ${fmtDate(to)}` };
      }
      break;
  }
  return { key: "mes", from: ymd(y, m, 1), to: ymd(y, m, lastDay(y, m)), label: monthLabel(ymd(y, m, 1)) };
}

export function fmtDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export function monthLabel(iso: string): string {
  const m = MONTHS[Number(iso.slice(5, 7)) - 1] ?? "";
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} de ${iso.slice(0, 4)}`;
}
export function shortMonth(iso: string): string {
  return `${(MONTHS[Number(iso.slice(5, 7)) - 1] ?? "").slice(0, 3)}/${iso.slice(2, 4)}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
