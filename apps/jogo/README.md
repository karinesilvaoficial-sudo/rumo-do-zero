# Vale da Sucata

Battle royale em 3D no navegador, em terceira pessoa. Vinte robôs descem de paraquedas num
ferro-velho de 220 × 220 m; você controla um deles e os outros dezenove são do computador.
Quem fica por último vence. O resultado vai para um ranking gravado no servidor.

Fica isolado do resto do repositório: tem `package.json` e `package-lock.json` próprios, não entra
no workspace do pnpm e não afeta o site em `apps/web`.

## Rodar

```bash
cd apps/jogo
npm install
npm run build
npm start
```

Abra http://localhost:8787. Para desenvolver com recarga automática, use dois terminais:
`npm run server` e `npm run dev` (o Vite encaminha `/api` para a porta 8787).

```bash
npm test          # testes do backend
npm run typecheck
```

## Como se joga

1. Guie o paraquedas até onde quiser pousar.
2. Todos começam só com a pistola. Armas, munição, coletes e kits de reparo estão espalhados pelo mapa, marcados por um anel laranja.
3. A zona (parede laranja, círculo no minimapa) encolhe em cinco fases. Fora dela a vida cai, cada fase mais rápido. O círculo tracejado mostra para onde ela vai.
4. Tiro na cabeça causa 1,8× de dano. O colete absorve 60% do dano enquanto durar.

| Arma | Dano | Pente | Para quê |
|---|---|---|---|
| Pistola P9 | 17 | 12 | Arma inicial |
| Submetralhadora Vespa | 13 | 28 | Curta distância, muito rápida |
| Escopeta Trovão | 8 × 9 | 6 | Devastadora de perto |
| Fuzil AR-7 | 24 | 30 | Equilibrada, média distância |
| Rifle Longo | 72 | 5 | Longa distância, lenta |

## Controles

| Ação | Computador | Celular |
|---|---|---|
| Mover e guiar o paraquedas | W A S D | Lado esquerdo da tela |
| Mirar | Mouse | Lado direito da tela |
| Atirar | Botão esquerdo | Botão Tiro |
| Pegar arma | E | Pegar |
| Trocar de arma | 1, 2 ou roda do mouse | Troca |
| Recarregar | R | Rec. |
| Kit de reparo | Q | Kit |
| Correr / pular | Shift / Espaço | Alavanca até o fim / Pulo |
| Pausar | Esc | — |

## Como é feito

| Arquivo | Responsabilidade |
|---|---|
| `src/mundo.ts` | Terreno, muro, contêineres, ruínas, barreiras, caixotes, torre, árvores, pedras, céu, luz, colisão e linha de visão |
| `src/texturas.ts` | Texturas geradas em canvas (cor + mapa de normais) |
| `src/combatentes.ts` | Robôs em GLB: física, paraquedas, animação, pose dos braços com a arma, dano e detecção de acerto |
| `src/armas.ts` | Fichas das cinco armas, modelos 3D e itens do chão |
| `src/bots.ts` | Inteligência dos robôs: saquear, combater, fugir da zona |
| `src/zona.ts` | Zona que encolhe |
| `src/controle.ts` | Teclado, mouse e toque |
| `src/main.ts` | Partida, tiros, câmera em terceira pessoa, HUD, minimapa e menu |
| `server/server.mjs` | API, banco SQLite e entrega dos arquivos do jogo |

## Backend

Node 22 sem dependências externas (`node:http` e `node:sqlite`). O banco fica em `dados/batalha.sqlite`.

| Rota | Função |
|---|---|
| `POST /api/partidas` | Abre uma partida e devolve `id` e `token` |
| `POST /api/partidas/:id/fim` | Recebe nome, abates e colocação; valida, calcula os pontos e grava |
| `GET /api/ranking?limite=10` | Melhores pontuações |
| `GET /api/saude` | Verificação de funcionamento |

Pontos = abates × 100 + (20 − colocação) × 40, mais 500 pela vitória. Quem calcula é o servidor:
o navegador envia só abates e colocação. O servidor mede a duração pelo próprio relógio e recusa
o que não cabe nela (abates demais para o tempo, vitória em menos de 45 segundos, envio repetido,
token errado). Isso barra a fraude simples. Como a simulação roda no navegador, um cliente
modificado ainda consegue enviar um resultado falso dentro do plausível.

Variáveis: `PORT` (padrão 8787) e `BANCO` (caminho do arquivo SQLite).

Para publicar, use um serviço que mantenha um processo Node e disco persistente. Hospedagem
serverless não preserva o arquivo SQLite entre execuções.

## Créditos

- Modelo dos robôs: `RobotExpressive.glb`, de Tomás Laulhé (Quaternius), modificado por Don McCurdy. Licença CC0 1.0. Obtido do repositório de exemplos do three.js.
- Motor de renderização: three.js (licença MIT).
- Texturas e sons: gerados pelo próprio código.
