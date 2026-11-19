# Vale da Sucata

Jogo de tiro em primeira pessoa, 3D, no navegador. Arena aberta de 150 × 150 m, ondas de robôs,
ranking gravado no servidor.

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

## Controles

W A S D mover · mouse mirar · botão esquerdo atirar · R recarregar · Shift correr · Espaço pular · Esc pausar

## Como é feito

| Arquivo | Responsabilidade |
|---|---|
| `src/mundo.ts` | Terreno com relevo, muro do perímetro, contêineres, ruínas, barreiras, caixotes, torre, árvores, pedras, céu, luz e colisão |
| `src/texturas.ts` | Texturas geradas em canvas (cor + mapa de normais): grama, terra, concreto, chapa, madeira, casca, folhas, pedra, metal |
| `src/jogador.ts` | Movimento, pulo, gravidade e câmera |
| `src/arma.ts` | Fuzil: cadência, pente, recarga, recuo, dispersão, clarão e rastro |
| `src/inimigos.ts` | Robôs em GLB com animação, três tipos, IA, projéteis e detecção de acerto |
| `src/main.ts` | Laço do jogo, ondas, suprimentos, HUD, minimapa e menu |
| `server/server.mjs` | API, banco SQLite e entrega dos arquivos do jogo |

Inimigos: sucateiro (amarelo, corre e bate), atirador (vermelho, mantém distância e dispara),
brutamontes (azul, grande e resistente, a partir da onda 3). Tiro na cabeça causa 2,2× de dano.

## Backend

Node 22 sem dependências externas (`node:http` e `node:sqlite`). O banco fica em `dados/jogo.sqlite`.

| Rota | Função |
|---|---|
| `POST /api/partidas` | Abre uma partida e devolve `id` e `token` |
| `POST /api/partidas/:id/fim` | Recebe nome, pontos, abates e onda; valida e grava |
| `GET /api/ranking?limite=10` | Melhores pontuações |
| `GET /api/saude` | Verificação de funcionamento |

O servidor mede a duração da partida pelo próprio relógio e recusa resultado incompatível com ela
(pontos ou abates demais para o tempo, onda alta com poucos abates, envio repetido, token errado).
Isso barra a fraude simples. Como a simulação roda no navegador, um cliente modificado ainda
consegue enviar pontuações falsas dentro dos limites plausíveis.

Variáveis: `PORT` (padrão 8787) e `BANCO` (caminho do arquivo SQLite).

Para publicar, use um serviço que mantenha um processo Node e disco persistente. Hospedagem
serverless não preserva o arquivo SQLite entre execuções.

## Créditos

- Modelo dos robôs: `RobotExpressive.glb`, de Tomás Laulhé (Quaternius), modificado por Don McCurdy. Licença CC0 1.0. Obtido do repositório de exemplos do three.js.
- Motor de renderização: three.js (licença MIT).
- Texturas e sons: gerados pelo próprio código.
