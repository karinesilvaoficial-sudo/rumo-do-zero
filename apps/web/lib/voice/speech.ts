import { centsToSpeech, parseBRLInput } from "@rumo/contracts";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * Normaliza texto para fala (o texto visual original não muda): valores, percentuais, datas e siglas.
 * Remove identificadores técnicos (UUIDs, chaves) — nunca são falados.
 */
export function normalizeForSpeech(input: string): string {
  let t = input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
    .replace(/\b(sk|pk|rk|whsec|re)_[A-Za-z0-9_]{8,}\b/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#>`|]/g, " ");
  t = t.replace(/(?:[-−]\s?)?R\$\s?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?/g, (m) => {
    const neg = /^[-−]/.test(m.trim());
    const v = parseBRLInput(m.replace(/^[-−]\s?/, ""));
    return v === null ? m : centsToSpeech(neg ? -v : v);
  });
  t = t.replace(/(\d+(?:,\d+)?)\s?%/g, "$1 por cento");
  t = t.replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g, (_, d, m, y) => `${Number(d)} de ${MONTHS[Number(m) - 1] ?? m} de ${y}`);
  t = t.replace(/\b(\d{2})\/(\d{2})\b/g, (_, d, m) => (Number(m) >= 1 && Number(m) <= 12 ? `${Number(d)} de ${MONTHS[Number(m) - 1]}` : `${d}/${m}`));
  t = t.replace(/\bPDF\b/g, "PDF").replace(/\bIA\b/g, "I A").replace(/\bCSV\b/g, "C S V").replace(/\bPIX\b/gi, "Pix");
  return t.replace(/\s+/g, " ").trim().slice(0, 4000);
}

/** Reserva conservadora de segundos de áudio a partir do texto (~2,3 palavras/s + 20%). */
export function estimateSpeechSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.ceil((words * 12) / 23)); // words / 2,3 × 1,2 em inteiros
}

/** Duração real de MP3 CBR 128 kbps (mp3_44100_128) a partir dos bytes gerados. */
export function mp3Seconds(bytes: number, kbps = 128): number {
  return Math.ceil((bytes * 8) / (kbps * 1000));
}
