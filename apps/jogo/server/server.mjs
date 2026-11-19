// Backend do Vale da Sucata: partidas, validação do resultado e ranking.
// Sem dependências externas: http e sqlite nativos do Node 22.
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const TOTAL = 20; // combatentes por partida: 1 pessoa e 19 robôs

// A pontuação é calculada aqui, a partir do que a partida permite: o cliente não envia pontos.
export function pontuar({ abates, colocacao }) {
  return abates * 100 + (TOTAL - colocacao) * 40 + (colocacao === 1 ? 500 : 0);
}

export function validarResultado({ abates, colocacao, duracaoMs }) {
  if (!Number.isInteger(abates) || !Number.isInteger(colocacao)) return 'valores inválidos';
  if (abates < 0 || abates > TOTAL - 1) return 'abates fora do limite da partida';
  if (colocacao < 1 || colocacao > TOTAL) return 'colocação inválida';
  if (duracaoMs < 8_000) return 'partida curta demais';
  if (duracaoMs > 60 * 60 * 1000) return 'partida expirada';
  const seg = duracaoMs / 1000;
  if (abates > seg / 3 + 1) return 'abates incompatíveis com o tempo';
  if (colocacao === 1 && seg < 45) return 'vitória rápida demais';
  return null;
}

export function limparNome(nome) {
  const limpo = String(nome ?? '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} _.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
  return limpo || 'Anônimo';
}

export function criarApp({ arquivoBanco = ':memory:', pastaEstatica = path.join(RAIZ, 'dist'), agora = () => Date.now() } = {}) {
  const db = new DatabaseSync(arquivoBanco);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS partidas (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      inicio INTEGER NOT NULL,
      fim INTEGER,
      nome TEXT,
      pontos INTEGER,
      abates INTEGER,
      colocacao INTEGER
    );
    CREATE INDEX IF NOT EXISTS partidas_ranking ON partidas (pontos DESC) WHERE fim IS NOT NULL;
  `);
  const q = {
    criar: db.prepare('INSERT INTO partidas (id, token, inicio) VALUES (?, ?, ?)'),
    buscar: db.prepare('SELECT * FROM partidas WHERE id = ?'),
    finalizar: db.prepare('UPDATE partidas SET fim = ?, nome = ?, pontos = ?, abates = ?, colocacao = ? WHERE id = ? AND fim IS NULL'),
    ranking: db.prepare('SELECT nome, pontos, abates, colocacao, fim FROM partidas WHERE fim IS NOT NULL ORDER BY pontos DESC, fim ASC LIMIT ?'),
    posicao: db.prepare('SELECT COUNT(*) + 1 AS pos FROM partidas WHERE fim IS NOT NULL AND pontos > ?'),
    limpar: db.prepare('DELETE FROM partidas WHERE fim IS NULL AND inicio < ?'),
  };

  // Limite de requisições por IP: janela deslizante em memória.
  const acessos = new Map();
  function excedeu(ip, max = 30, janelaMs = 60_000) {
    const t = agora();
    const lista = (acessos.get(ip) ?? []).filter((x) => t - x < janelaMs);
    lista.push(t);
    acessos.set(ip, lista);
    if (acessos.size > 5000) acessos.clear();
    return lista.length > max;
  }

  function json(res, status, corpo) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(corpo));
  }

  async function lerCorpo(req) {
    let dados = '';
    for await (const parte of req) {
      dados += parte;
      if (dados.length > 4096) throw new Error('corpo grande demais');
    }
    return dados ? JSON.parse(dados) : {};
  }

  async function api(req, res, url) {
    const ip = req.socket.remoteAddress ?? '?';
    if (req.method === 'GET' && url.pathname === '/api/saude') return json(res, 200, { ok: true });

    if (req.method === 'GET' && url.pathname === '/api/ranking') {
      const limite = Math.min(50, Math.max(1, Number(url.searchParams.get('limite')) || 10));
      return json(res, 200, { ranking: q.ranking.all(limite) });
    }

    if (req.method === 'POST' && url.pathname === '/api/partidas') {
      if (excedeu(ip)) return json(res, 429, { erro: 'muitas requisições' });
      q.limpar.run(agora() - 60 * 60 * 1000);
      const id = randomUUID();
      const token = randomBytes(24).toString('hex');
      q.criar.run(id, token, agora());
      return json(res, 201, { id, token });
    }

    const fim = url.pathname.match(/^\/api\/partidas\/([0-9a-f-]{36})\/fim$/);
    if (req.method === 'POST' && fim) {
      if (excedeu(ip)) return json(res, 429, { erro: 'muitas requisições' });
      let corpo;
      try {
        corpo = await lerCorpo(req);
      } catch {
        return json(res, 400, { erro: 'corpo inválido' });
      }
      const partida = q.buscar.get(fim[1]);
      if (!partida) return json(res, 404, { erro: 'partida não encontrada' });
      const a = Buffer.from(String(corpo.token ?? ''));
      const b = Buffer.from(partida.token);
      if (a.length !== b.length || !timingSafeEqual(a, b)) return json(res, 403, { erro: 'token inválido' });
      if (partida.fim) return json(res, 409, { erro: 'partida já finalizada' });
      const resultado = { abates: corpo.abates, colocacao: corpo.colocacao, duracaoMs: agora() - partida.inicio };
      const motivo = validarResultado(resultado);
      if (motivo) return json(res, 422, { erro: motivo });
      const nome = limparNome(corpo.nome);
      const pontos = pontuar(resultado);
      q.finalizar.run(agora(), nome, pontos, resultado.abates, resultado.colocacao, partida.id);
      return json(res, 200, { nome, pontos, posicao: q.posicao.get(pontos).pos, ranking: q.ranking.all(10) });
    }

    return json(res, 404, { erro: 'rota não encontrada' });
  }

  const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon' };

  async function estatico(res, url) {
    const relativo = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]|\.\.)+/, '');
    let arquivo = path.join(pastaEstatica, relativo || 'index.html');
    if (!arquivo.startsWith(pastaEstatica)) arquivo = path.join(pastaEstatica, 'index.html');
    try {
      if ((await stat(arquivo)).isDirectory()) arquivo = path.join(arquivo, 'index.html');
      const dados = await readFile(arquivo);
      const imutavel = relativo.startsWith('assets/');
      res.writeHead(200, {
        'content-type': TIPOS[path.extname(arquivo)] ?? 'application/octet-stream',
        'cache-control': imutavel ? 'public, max-age=31536000, immutable' : 'no-cache',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self' blob: data:",
      });
      res.end(dados);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Não encontrado. Rode "npm run build" para gerar o jogo.');
    }
  }

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://local');
    const tarefa = url.pathname.startsWith('/api/') ? api(req, res, url) : estatico(res, url);
    tarefa.catch((erro) => {
      console.error(erro);
      if (!res.headersSent) json(res, 500, { erro: 'erro interno' });
    });
  });
  return { servidor, db };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const porta = Number(process.env.PORT) || 8787;
  const arquivoBanco = process.env.BANCO ?? path.join(RAIZ, 'dados', 'batalha.sqlite');
  if (arquivoBanco !== ':memory:') await (await import('node:fs/promises')).mkdir(path.dirname(arquivoBanco), { recursive: true });
  criarApp({ arquivoBanco }).servidor.listen(porta, () => console.log(`Vale da Sucata em http://localhost:${porta}`));
}
