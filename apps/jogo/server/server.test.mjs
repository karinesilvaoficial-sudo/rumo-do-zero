import test from 'node:test';
import assert from 'node:assert/strict';
import { criarApp, validarResultado, limparNome } from './server.mjs';

async function subir() {
  let relogio = 1_000_000;
  const app = criarApp({ agora: () => relogio });
  await new Promise((ok) => app.servidor.listen(0, ok));
  const base = `http://127.0.0.1:${app.servidor.address().port}`;
  const post = (rota, corpo) => fetch(base + rota, { method: 'POST', body: JSON.stringify(corpo ?? {}) });
  return { base, post, avancar: (ms) => (relogio += ms), fechar: () => app.servidor.close() };
}

test('fluxo completo: cria partida, finaliza e aparece no ranking', async () => {
  const s = await subir();
  const { id, token } = await (await s.post('/api/partidas')).json();
  s.avancar(120_000);
  const r = await s.post(`/api/partidas/${id}/fim`, { token, nome: '  Kari<script>  ', pontos: 2400, abates: 20, onda: 3 });
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.nome, 'Kariscript');
  assert.equal(corpo.posicao, 1);
  const { ranking } = await (await fetch(s.base + '/api/ranking')).json();
  assert.equal(ranking[0].pontos, 2400);
  s.fechar();
});

test('recusa token errado, envio repetido e pontuação impossível', async () => {
  const s = await subir();
  const { id, token } = await (await s.post('/api/partidas')).json();
  s.avancar(60_000);
  assert.equal((await s.post(`/api/partidas/${id}/fim`, { token: 'x', pontos: 1, abates: 1, onda: 1 })).status, 403);
  assert.equal((await s.post(`/api/partidas/${id}/fim`, { token, pontos: 999_999, abates: 5, onda: 1 })).status, 422);
  assert.equal((await s.post(`/api/partidas/${id}/fim`, { token, pontos: 500, abates: 5, onda: 1 })).status, 200);
  assert.equal((await s.post(`/api/partidas/${id}/fim`, { token, pontos: 500, abates: 5, onda: 1 })).status, 409);
  assert.equal((await s.post('/api/partidas/00000000-0000-0000-0000-000000000000/fim', { token })).status, 404);
  s.fechar();
});

test('recusa partida finalizada cedo demais e limita requisições', async () => {
  const s = await subir();
  const { id, token } = await (await s.post('/api/partidas')).json();
  assert.equal((await s.post(`/api/partidas/${id}/fim`, { token, pontos: 0, abates: 0, onda: 1 })).status, 422);
  let ultimo = 0;
  for (let i = 0; i < 35; i++) ultimo = (await s.post('/api/partidas')).status;
  assert.equal(ultimo, 429);
  s.fechar();
});

test('validação e limpeza de nome', () => {
  assert.equal(validarResultado({ pontos: 100, abates: 1, onda: 1, duracaoMs: 30_000 }), null);
  assert.ok(validarResultado({ pontos: 1.5, abates: 1, onda: 1, duracaoMs: 30_000 }));
  assert.ok(validarResultado({ pontos: 100, abates: 500, onda: 1, duracaoMs: 30_000 }));
  assert.ok(validarResultado({ pontos: 100, abates: 4, onda: 30, duracaoMs: 300_000 }));
  assert.equal(limparNome(''), 'Anônimo');
  assert.equal(limparNome('João   da Silva Sauro Neto'), 'João da Silva Sa');
});
