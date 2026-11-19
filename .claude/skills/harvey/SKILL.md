---
name: harvey
description: >
  Harvey — skill única que une design-taste-frontend, grilling, agent-browser, hyperframes,
  find-skills, impeccable, task-observer e claude-mem em um único fluxo de trabalho
  (interrogar → lembrar → descobrir → construir com bom gosto → verificar no navegador →
  polir → gerar vídeo → observar e aprender). Use quando o usuário disser "train",
  "harvey", "/harvey", ou pedir para criar/refinar interface, landing page, componente,
  vídeo de produto ou para "treinar" o agente no projeto.
---

# Harvey 🎩 — "train"

Uma skill, oito capacidades. Palavra-gatilho: **`train`**.

Quando o usuário disser **train** (sozinho ou seguido de um pedido, ex.: `train landing page do Rumo do Zero`),
rode o ciclo abaixo **na ordem**. Pule uma fase só se ela claramente não se aplica — e diga qual pulou e por quê.

```
0 MEMÓRIA → 1 GRILL → 2 DESCOBRIR → 3 GOSTO → 4 CONSTRUIR → 5 NAVEGADOR → 6 IMPECÁVEL → 7 VÍDEO → 8 OBSERVAR
 claude-mem  grilling  find-skills  design-taste   (código)   agent-browser  impeccable  hyperframes  task-observer
```

Variantes do gatilho:

| Comando | O que faz |
|---|---|
| `train` | Ciclo completo (fases 0–8) |
| `train grill` | Só a fase 1: interrogatório até ter um plano fechado |
| `train design` | Fases 3–6: construir/refinar UI com gosto, verificar e polir |
| `train audit` | Fases 5–6 sobre o que já existe (sem escrever código novo até o usuário aprovar) |
| `train video` | Fase 7: vídeo de produto/demo em HyperFrames |
| `train skills` | Fase 2: buscar skills que faltam |
| `train recall` | Fase 0: o que já sabemos deste projeto |
| `train learn` | Fase 8: registrar lições da sessão |

---

## Fase 0 — Memória (claude-mem)

Objetivo: nunca começar do zero. Memória persistente entre sessões.

1. Leia `.claude/memory/harvey.md` (crie se não existir). Se o plugin **claude-mem** estiver instalado
   (ferramentas `mcp__*claude-mem*`/`search`, `timeline`, `get_observations`), use-o primeiro:
   busca → linha do tempo → só então observações completas (progressive disclosure, economiza tokens).
2. Extraia: decisões já tomadas, preferências visuais, stack, comandos que funcionam, erros a não repetir.
3. Resuma em ≤5 linhas para o usuário: *"Já sei que…"*. Não re-pergunte o que já está registrado.

Formato do arquivo de memória (append-only, mais recente no topo):

```md
## 2026-11-19 — <tema>
- Decisão: …
- Preferência: …
- Funcionou: `pnpm --filter web dev`
- Evitar: …
```

Nunca grave segredos, tokens, e-mails ou dados pessoais na memória.

## Fase 1 — Grill (grilling / "grill me")

Objetivo: entendimento compartilhado antes de qualquer código.

- Entreviste o usuário **sem dó**, percorrendo cada ramo da árvore de decisão até resolver as dependências entre decisões.
- **Uma pergunta por vez.** Para cada pergunta, dê **sua resposta recomendada** — o usuário só confirma ou corrige.
- Se a resposta está no código, **explore o código em vez de perguntar**.
- Ramos típicos: público e objetivo · métrica de sucesso · escopo (o que NÃO entra) · conteúdo real disponível ·
  marca/tom · stack e restrições · mobile-first? · prazo · como saberemos que terminou.
- Termine com um **plano de 5–10 linhas** e peça um "ok". Sem "ok", não construa.

## Fase 2 — Descobrir (find-skills)

Objetivo: não reinventar o que já existe como skill.

1. Verifique as skills já disponíveis na sessão (lista de skills do sistema) e em `.claude/skills/`.
2. Se faltar algo, procure no ecossistema aberto:
   ```bash
   npx skills find <termo>
   ```
   e sugira a instalação com `npx skills add <owner/repo@skill>` (ou navegue em https://skills.sh).
3. Só instale com aprovação do usuário. Prefira skills de fontes conhecidas; leia o SKILL.md antes de usar.

## Fase 3 — Gosto (design-taste-frontend)

Objetivo: fugir do "visual genérico de IA". Defina a direção **antes** de escrever CSS.

Escolha e declare em 3 linhas: **conceito** (ex.: "editorial calmo", "brutalista confiante") · **tipografia** · **paleta**.

Regras de gosto:

- **Tipografia:** no máximo 2 famílias; nada de Inter/Roboto/Arial por padrão — escolha com intenção.
  Escala com contraste real (título ≥ 2.5× o corpo), `tracking` negativo em títulos grandes, corpo 16–18px, linha 1.5–1.7, medida 60–75 caracteres.
- **Cor:** tokens em `:root` (`--bg`, `--fg`, `--muted`, `--accent`, `--border`). Uma cor de destaque usada com parcimônia.
  Proibido: gradiente roxo→azul, glow neon gratuito, cinza puro sobre cor (use tons da própria paleta). Suporte a dark mode.
- **Layout:** grid com respiro; assimetria intencional > tudo centralizado; espaçamento em escala (4/8/12/16/24/32/48/64/96).
  Evite o kit clichê "hero + 3 cards com ícone + depoimentos + CTA" sem motivo.
- **Componentes:** cantos e sombras consistentes (um raio, uma elevação); ícones de uma família só; nada de emoji como ícone.
- **Movimento:** poucos e com significado — entrada escalonada no carregamento, hover sutil; 150–300ms, `ease-out`;
  respeite `prefers-reduced-motion`.
- **Conteúdo real** sempre que possível; lorem ipsum é dívida.
- **Dials** (pergunte ou infira): variância do design (1–10), intensidade de movimento (1–10), densidade visual (1–10).

## Fase 4 — Construir

- Siga o padrão do repositório (monorepo pnpm: `apps/*`, `packages/*`). Reuse componentes e tokens existentes antes de criar novos.
- Mobile-first, HTML semântico, acessível por padrão (labels, foco visível, contraste AA, `alt`).
- Commits pequenos e descritivos.

## Fase 5 — Navegador (agent-browser)

Objetivo: **ver** o resultado, não supor.

Preferência de ferramenta: `agent-browser` CLI se instalado → senão Playwright (já disponível no ambiente):

```bash
agent-browser open http://localhost:3000
agent-browser snapshot -i          # árvore de acessibilidade com refs (@e1, @e2…)
agent-browser click @e3
agent-browser fill @e5 "teste@exemplo.com"
agent-browser screenshot out.png
```

Fallback Playwright (Node): abrir a página, screenshot em 390px (mobile) e 1440px (desktop), checar console sem erros,
clicar nos fluxos principais. Use `deviceScaleFactor: 2` para screenshots que o usuário vai ver.

Checklist: sem erros no console · sem scroll horizontal no mobile · CTAs funcionam · formulários validam · dark mode ok.

## Fase 6 — Impecável (impeccable)

Objetivo: polimento e auditoria com vocabulário de designer. Avalie e corrija nesta ordem:

1. **audit** — acessibilidade (contraste, foco, alvos ≥44px, semântica), performance (LCP, imagens, fontes), responsivo.
2. **critique** — hierarquia, ritmo, consistência, "parece feito por IA?".
3. **normalize** — alinhar a tokens e escala de espaçamento.
4. **typeset** — refinar tipografia (pesos, kerning, quebras, viúvas).
5. **arrange** — espaçamento e alinhamento.
6. **clarify** — microcopy: botões com verbo, erros que dizem como resolver.
7. **harden** — estados vazios, loading, erro, textos longos, i18n.
8. **delight / animate** — só depois de tudo acima, e com moderação.
9. **polish** — passada final.

Anti-padrões a caçar: texto cinza sobre fundo colorido · cards dentro de cards · bordas + sombras + fundo ao mesmo tempo ·
ícones decorativos sem função · centralizar tudo · `!important` · cores fora dos tokens.

Reporte em tabela: problema → severidade (alta/média/baixa) → correção aplicada.

## Fase 7 — Vídeo (hyperframes)

Objetivo: vídeo de produto/demo a partir de HTML.

- **Local (este ambiente / Claude Code):** use as skills do HyperFrames (`npx skills add heygen-com/hyperframes`) →
  composição HTML + GSAP em disco; `npx hyperframes preview` e `npx hyperframes render`.
- **Projeto hospedado na HeyGen** (link compartilhável, render na nuvem): use o MCP **HyperFrames by HeyGen**
  (`list_projects`, `get_project`, `get_render_status`). `compose`/`render_video` só funcionam em clientes hospedados.
- Estrutura padrão de 15–30s: gancho (0–3s) → problema → produto em ação (reuse a UI real da Fase 4) → prova → CTA.
- Mesma direção visual da Fase 3 (tokens, fontes). Legendas sempre.

## Fase 8 — Observar e aprender (task-observer)

Objetivo: o agente melhora a cada sessão.

Durante todo o ciclo, observe em silêncio:
- correções do usuário ("não, assim não…"), preferências repetidas, comandos que falharam e como foram resolvidos,
  passos que se repetiram e poderiam virar automação.

Ao final (ou em `train learn`):
1. Grave as lições em `.claude/memory/harvey.md` (formato da Fase 0) — e no claude-mem, se disponível.
2. Se um padrão apareceu ≥2 vezes, **proponha** uma melhoria nesta própria skill (`.claude/skills/harvey/SKILL.md`)
   mostrando o diff. Só aplique com "ok" do usuário.
3. Encerre com: o que foi feito · o que foi verificado (com evidência: screenshot/comando) · o que ficou pendente.

---

## Regras gerais

- Responda em português do Brasil, a menos que o usuário peça outro idioma.
- Não declare pronto sem evidência da Fase 5.
- Ações externas (instalar skill, publicar, render na nuvem, push) pedem confirmação.
- Créditos das ideias originais: design-taste-frontend (taste-skill), grilling ("grill me", Matt Pocock),
  agent-browser (Vercel Labs), hyperframes (HeyGen), find-skills (Vercel skills), impeccable (Paul Bakaus),
  task-observer, claude-mem (thedotmack).
