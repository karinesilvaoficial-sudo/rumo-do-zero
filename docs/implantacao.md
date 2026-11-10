# Implantação e operação

## Local
```
pnpm install
cd apps/analytics && uv sync
pnpm --dir apps/web dev            # http://localhost:3000
uv run --directory apps/analytics uvicorn main:app --port 8000
```
Testes: `bash supabase/tests/run.sh` (Postgres efêmero com stub mínimo de Supabase) · `uv run --directory apps/analytics pytest` · `pnpm -r test` · `pnpm --dir apps/web build && pnpm --dir tests e2e`.

## Supabase (por ambiente: dev, preview, produção — projetos separados)
1. Aplicar `supabase/migrations/*` em ordem (`supabase db push`). **Não** aplicar `supabase/tests/*` em projeto real.
2. Expor schema `public` na API (padrão). `private` não deve ser exposto.
3. Auth: Google (Client ID/Secret no painel), e-mail/senha com confirmação; URLs de retorno: `<APP>/auth/callback` e `<APP>/auth/confirm`; Site URL = `<APP>`. Templates de e-mail com `{{ .TokenHash }}` → `/auth/confirm?token_hash=...&type=...`.
4. SMTP próprio (Resend SMTP) para produção.
5. Marcar o operador como admin: `update profiles set is_platform_admin = true where id = '<uuid>'` (SQL editor).

## Vercel
- Projeto **web**: raiz `apps/web`, framework Next.js, região `gru1`, variáveis do `.env.example`. Cron diário em `apps/web/vercel.json` (compatível com Hobby). No Pro, adicione `/api/cron/frequent` a cada 10 min para fila de e-mails e relatórios grandes; no Hobby, convites são enviados na hora e o restante da fila sai no ciclo diário. Uso comercial requer plano compatível (não Hobby).
- Projeto **analytics**: raiz `apps/analytics`, runtime Python (FastAPI detectado em `main.py`), variável `RUMO_SERVICE_SECRET` igual à do web.

## Stripe (modo de teste primeiro)
Products Pro/Max/Ilimitado; Prices mensal e anual (anual = 10× mensal) em BRL → IDs em `STRIPE_PRICE_*`. Webhook em `<APP>/api/webhooks/stripe` com eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`. Configurar o Customer Portal (troca de plano com prorrogação, cancelamento no fim do período). Pix: confirmar elegibilidade da conta antes de `STRIPE_PIX_ENABLED=true`. Não habilitar `automatic_tax` sem registros fiscais.

## Rollback e backup
Rollback de código: "Promote" de deployment anterior na Vercel. Migrações não são desfeitas pelo rollback; cada migração de dados precisa de script reverso próprio. Backup: PITR/backup diário do Supabase; testar restauração em projeto separado trimestralmente.

## Diagnóstico
`/app/admin` (integrações, filas, webhooks, consumo). Rotas de custo retornam 503 `cost_cap_missing` em produção até o teto ser configurado ali.
