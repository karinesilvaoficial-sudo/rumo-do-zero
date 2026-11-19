import test from 'node:test';
import assert from 'node:assert/strict';
import { criarApp, validarResultado, limparNome, pontuar } from './server.mjs';

async function subir() {
  let relogio = 1_000_000;
  const app = criarApp({ agora: () => relogio });
  await new Promise((ok) => app.servidor.listen(0, ok));
  const base = `http://127.0.0.1:${app.servidor.address().port}`;
  const post = (rota, corpo) => fetch(base + rota, { method: 'POST', body: JSON.stringify(corpo ?? {}) });
  return { base, post, avancar: (ms) => (relogio += ms), fechar: () => app.servidor.close() };
}

test('fluxo completo: cria partida, finaliza e aparece no ranking com pontos calculados no servidor', async () => {
  const s = await subir();
  const { id, token } = await (await s.post('/api/partidas')).json();
  s.avancar(180_000);
  const r = await s.post(`/api/partidas/${id}/fim`, { token, nome: '  Kari<script>  ', abates: 5, colocacao: 1, pontos: 999_999 });
  assert.equal(r.status, 200);
  const corpo = await r.json();
  assert.equal(corpo.nome, 'Kariscript');
  assert.equal(corpo.pontos, 5 * 100 + 19 * 40 + 500);
  assert.equal(corpo.posicao, 1);
  const { ranking } = await (await fetch(s.base + '/api/ranking')).json();
  assert.equal(ranking[0].pontos, corpo.pontos);
  assert.equal(ranking[0].colocacao, 1);
  s.fechar();
});

test('recusa token errado, envio repetido e resultado impossível', async () => {
  const s = await subir();
  const { id, token } = await (await s.post('/api/partidas')).json();
  s.avancar(20_000);
  assert.equal((await s.post(`/api/partidas/${id}/fim`, { token: 'x', abates: 1, colocacao: 9 })).status, 403);
  assert.equal((await s.post(`/api/partidas/${id}/fim`, { token, abates: 19, colocacao: 9 })).status, 422);
  assert.equal((await s.post(`/api/partidas/${id}/fim`, { token, abates: 2, colocacao: 1 })).status, 422);
  assert.equal((await s.post(`/api/partidas/${id}/fim`, { token, abates: 2, colocacao: 12 })).status, 200);
  assert.equal((await s.post(`/api/partidas/${id}/fim`, { token, abates: 2, colocacao: 12 })).status, 409);
  assert.equal((await s.post('/api/partidas/00000000-0000-0000-0000-000000000000/fim', { token })).status, 404);
  s.fechar();
});

test('recusa partida finalizada cedo demais e limita requisições', async () => {
  const s = await subir();
  const { id, token } = await (await s.post('/api/partidas')).json();
  assert.equal((await s.post(`/api/partidas/${id}/fim`, { token, abates: 0, colocacao: 20 })).status, 422);
  let ultimo = 0;
  for (let i = 0; i < 35; i++) ultimo = (await s.post('/api/partidas')).status;
  assert.equal(ultimo, 429);
  s.fechar();
});

test('validação, pontuação e limpeza de nome', () => {
  assert.equal(validarResultado({ abates: 3, colocacao: 4, duracaoMs: 90_000 }), null);
  assert.ok(validarResultado({ abates: 1.5, colocacao: 4, duracaoMs: 90_000 }));
  assert.ok(validarResultado({ abates: 20, colocacao: 1, duracaoMs: 900_000 }));
  assert.ok(validarResultado({ abates: 0, colocacao: 21, duracaoMs: 90_000 }));
  assert.equal(pontuar({ abates: 0, colocacao: 20 }), 0);
  assert.equal(limparNome(''), 'Anônimo');
  assert.equal(limparNome('João   da Silva Sauro Neto'), 'João da Silva Sa');
});
