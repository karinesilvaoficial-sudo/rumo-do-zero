export type Linha = { nome: string; pontos: number; abates: number; onda: number };
type Partida = { id: string; token: string };

async function pedir<T>(rota: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(rota, init);
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null; // sem backend o jogo continua; só não grava o ranking
  }
}

export const api = {
  ranking: async () => (await pedir<{ ranking: Linha[] }>('/api/ranking?limite=10'))?.ranking ?? null,
  iniciar: () => pedir<Partida>('/api/partidas', { method: 'POST' }),
  finalizar: (p: Partida, dados: { nome: string; pontos: number; abates: number; onda: number }) =>
    pedir<{ posicao: number; ranking: Linha[] }>(`/api/partidas/${p.id}/fim`, { method: 'POST', body: JSON.stringify({ token: p.token, ...dados }) }),
};
