# Status da entrega — 09/11/2026

Ambiente de verificação: contêiner Linux, Node 22, Python 3.13, Postgres 16 local (stub mínimo de Supabase: papéis, `auth.uid()`, `storage.objects`), Chromium/Playwright 1.63 com WebGL por software. **Nenhuma credencial de provedor disponível** (Supabase, Anthropic, ElevenLabs, Stripe, Resend, Vercel). Nada foi publicado.

Legenda: ✅ implementado e verificado · 🟡 implementado, verificação depende de credencial · ⛔ bloqueado · ⬜ não iniciado

## Resultados dos testes
| Suíte | Resultado |
|---|---|
| SQL (`bash supabase/tests/run.sh`) | 7/7 arquivos: finanças, segurança/RLS, franquias+intenções, service role, cron/fuso, concorrência real (12 sessões), contrato de planos |
| Python (`pytest`) | 22 passaram (cálculos, assinatura HMAC, PDF real multi-página lido com pypdf, CSV/XLSX tipados e protegidos) |
| TS (`vitest`) | contracts 6 + web 19 (dinheiro, período/fuso, redirecionamento seguro, taxa, fala, cobrança/webhook, contrato HMAC Node↔Python) |
| Tipos / lint / build | `tsc` ok · ESLint 0 problemas · `next build` ok (41 rotas) |
| Navegador (`pnpm --dir tests e2e`) | 26/26 (desktop + Pixel 7): planos/preços, CSP+hidratação, axe WCAG 2.2 AA sem violações sérias, sem rolagem horizontal em 360/390/768/1280/1920, cena 3D sob demanda, sem WebGL, movimento reduzido, proteção de rotas/APIs |

## Critérios (seção 23)
| # | Item | Status | Evidência |
|---|---|---|---|
| 1 | Receita 1.000 − despesa 250 = 750; saldo inicial não é renda | ✅ | 10_finance.sql |
| 2 | Transferência preserva total | ✅ | 10_finance.sql |
| 3 | 100,00/3 = 33,33/33,33/33,34 e datas de fatura | ✅ | 10_finance.sql, test_calc.py |
| 4 | Compra + fatura sem despesa duplicada | ✅ | 10_finance.sql |
| 5 | Parcial, cancelamento, estorno | ✅ | 10_finance.sql |
| 6 | Recorrência executada 2× = 1 ocorrência | ✅ | 10_finance.sql, 50_cron.sql, 90_concurrency.sh |
| 7 | Desconhecido ≠ zero (juros, margem) | ✅ | 10_finance.sql, test_calc.py |
| 8 | Painel, API, Python, tabela e PDF concordam | 🟡 | Mesma função SQL alimenta todos; teste ponta a ponta requer Supabase |
| 9–13 | Isolamento, papéis, convites, remoção, campos protegidos | ✅ | 20_security.sql (inclui falha real encontrada e corrigida em `is_service_role`) |
| 14 | Texto malicioso não executa ações | ✅ (banco) / 🟡 (modelo) | 30_quotas_intents.sql; prompt trata dados como não confiáveis |
| 15 | IA usa espaço/período e aponta lacunas | 🟡 | Código pronto; requer `ANTHROPIC_API_KEY` |
| 16 | Preparar não grava; confirmar 1×; expirada/alterada rejeitada | ✅ | 30_quotas_intents.sql |
| 17 | Falha do provedor libera reserva sem fingir sucesso | 🟡 | Código (settle 0); requer provedor |
| 18 | Créditos resistem a concorrência; reserva liberada | ✅ | 90_concurrency.sh, 30_quotas_intents.sql |
| 19–21 | Voz, microfone, áudio isolado por espaço | 🟡 / ⛔ voz real | Código + política de storage testada (20_security.sql); sem chave ElevenLabs — docs/voz.md |
| 22–28 | Cobrança: retorno sem pagamento, duplicados, ordem, Pix, anual mensal, 10×, estorno | ✅ lógica / 🟡 provedor | events.test.ts, core.test.ts, 30_quotas_intents.sql, 91_plans_contract.sh |
| 29 | Jornadas logadas no navegador | ⛔ | Requer projeto Supabase (pilha local exigiria executar binários baixados — não autorizado nesta sessão) |
| 30 | Cliques rápidos/voltar/sessão expirada | 🟡 | GSAP cancela timeline por rota; idempotência por chave; não exercitado logado |
| 31 | Sem WebGL / movimento reduzido | ✅ | nowebgl.spec.ts, public.spec.ts |
| 32 | PDF e planilha inspecionados | ✅ | test_api.py, docs/evidencias/pdf-pagina-1.png |
| 33 | Falha de e-mail não vira "enviado" | 🟡 | Fila marca `sent` só após id do provedor |
| 34 | Tarefa retomada não repete efeito | ✅ banco | leases + SKIP LOCKED + dedupe (50_cron.sql) |
| 35 | Build, lint, tipos, migrações, contratos | ✅ | acima |

## Pendências concretas
1. **Repositório remoto** para guardar o código (a sessão é efêmera).
2. Projetos Supabase (dev/prod), Google OAuth, SMTP — docs/implantacao.md.
3. Chaves: Anthropic, ElevenLabs (+ criação da voz), Stripe (teste) + Prices, Resend, `RUMO_SERVICE_SECRET`, `CRON_SECRET`.
4. Dois projetos Vercel (plano comercial) e domínio.
5. Preços datados dos provedores e teto mensal (docs/custos.md) — sem teto, IA/voz ficam desligadas em produção.
6. Dados reais do operador em privacidade/termos; revisão jurídica.
7. Medições de LCP/INP/CLS, fps e memória em dispositivo real; teste de carga; HawkScan.
