# Decisões técnicas (09/11/2026)

| Tema | Decisão | Motivo |
|---|---|---|
| Monorepo | pnpm workspaces: `apps/web`, `apps/analytics`, `packages/contracts`, `packages/ui`, `supabase`, `tests`, `docs` | Estrutura pedida; domínio não fragmentado |
| Web | Next.js 16.4.5, React 19.3.1, TypeScript 5.9.3 estrito | TS 7 ainda não suportado pelo ecossistema Next |
| Node | 22 LTS | Versão LTS do ambiente |
| Python | 3.13, FastAPI 0.162.2, ReportLab 5.1.0, openpyxl 3.1.5, `uv.lock` + `requirements.txt` | Runtime Python da Vercel |
| Dinheiro | centavos `bigint` no banco; **string** no JSON; `bigint` no TS; `Decimal` no Python | Sem float em somas; sem perda > 2^53 |
| Arredondamento | parcelas: piso + resíduo na última; juros: ROUND_HALF_UP ao centavo | Ver politica-financeira.md |
| Fonte canônica | Funções SQL (`financial_summary`, `monthly_series`, `category_breakdown`, ...) | Painel, IA, relatório e PDF usam os mesmos números |
| Escritas | Só via funções `SECURITY DEFINER` em `private` (search_path vazio), wrappers `SECURITY INVOKER` em `public`; escrita direta revogada | Invariantes atômicas, auditoria, idempotência, versão |
| Python sem chave do banco | Node lê sob RLS e envia dados; Python só calcula/gera; HMAC com expiração 60 s e hash do corpo | Seção 3 |
| Física | Rapier (`@react-three/rapier`) | Escolhido entre Rapier e Cannon-es |
| Movimento | GSAP: câmera/objeto/luz/entrada do conteúdo (`[data-scene-content]`); Motion: microinterações (KPIs, chat) | Sem disputa pela mesma propriedade |
| Ambiente 3D | `RoomEnvironment` procedural (sem HDR externo), geometria procedural | Sem assets/URLs de terceiros |
| CSP | nonce por requisição no `proxy.ts` + `strict-dynamic`; páginas dinâmicas | Scripts inline do Next recebem nonce |
| Gráficos | ECharts 6 sob demanda, renderer SVG, `aria` + tabela equivalente | Acessibilidade e exportação |
| Créditos de IA | 1 crédito = até 4.000 tokens in + 1.000 out somados; reserva por `countTokens`; orçamento limita o laço de ferramentas | Seção 13 |
| Conversa | Últimas 6 mensagens + "decisões confirmadas" (intenções executadas) como resumo determinístico versionado | Sem custo extra de sumarização |
| Gravações de voz | Não armazenadas (enviadas ao provedor e descartadas) | Retenção mínima |
| Áudio de tutorial | Cache por tela+versão+voz+modelo em bucket privado | Gerado uma vez por versão |
| Pix | Pagamento pontual pré-pago, renovação manual; bloqueado se houver assinatura automática ativa | Pix Automático restrito; sem cobrança dupla |
| Estorno/contestação | Total ou contestação revogam o período ligado ao pagamento; parcial mantém e audita | Nunca apaga dados pessoais |
| Colaborador | Pode criar, editar e estornar (auditado); não administra membros/cobrança | Regra uniforme (seção 15) |
| HawkScan | Não executado: sem `HAWK_API_KEY` nem app implantado | Registrado como pendência |
