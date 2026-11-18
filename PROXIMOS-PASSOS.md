# RUMO — estado do projeto e próximos passos

Documento de passagem de uma sessão do Claude na nuvem para uma sessão local (18/11/2026).
Leia isto primeiro. Nenhum segredo está aqui: as chaves ficam só nas variáveis da Vercel.

## Onde está tudo

| O quê | Onde |
|---|---|
| Código | GitHub `karinesilvaoficial-sudo/rumo-do-zero`, branch `main` |
| Site (produção) | https://rumo-do-zero.vercel.app (Vercel, projeto `rumo-do-zero`, Root Directory `apps/web`, região gru1) |
| Banco | Supabase, projeto `rumo-do-zero` (ref `pspqymsgnefceuvtjqwl`, sa-east-1) |
| Pagamentos | Cakto (Pix e, em breve, assinaturas) e Stripe (cartão, a ser desligado) |
| Empresa | Sal da Terra Online, operação digital, sem CNPJ |

Monorepo pnpm:
- `apps/web`: Next.js 16, React 19, TypeScript; `proxy.ts` com CSP por nonce.
- `apps/analytics`: FastAPI. **Não está publicado**, por isso relatórios e projeções estão desligados.
- `packages/contracts` (planos e dinheiro), `packages/ui` (tokens visuais), `supabase/` (migrações e testes SQL), `docs/`.

Regras do projeto (manter):
- Dinheiro sempre em centavos inteiros.
- Toda escrita no banco passa por funções `private.*` (SECURITY DEFINER) expostas como wrappers `public.*`; há RLS em todas as tabelas.
- As funções `public.svc_*` só podem ser chamadas pelo servidor (service_role).
- Acesso pago só é liberado por webhook verificado, nunca pela página de retorno.

Como testar localmente:

```bash
pnpm install
```

```bash
pnpm -C apps/web exec tsc --noEmit
```

```bash
pnpm -C apps/web exec vitest run
```

```bash
bash supabase/tests/run.sh
```

Os testes SQL precisam de PostgreSQL instalado localmente. Variáveis de ambiente de exemplo estão em `.env.example`.

## O que já funciona (verificado)

- **Cadastro e login:** e-mail/senha e Google. Para o Google funcionar, a URI de callback do Supabase tem de estar no cliente OAuth do Google Cloud.
- **App financeiro:** lançamentos, contas, planejamento (orçamentos, calendário, recorrências), metas, dívidas, rendas (perfil, contatos, propostas, tarefas), notificações no app, pessoas e papéis, painel admin.
- **Pix pela Cakto, testado de ponta a ponta com pagamento real (Pro):**
  - O botão "Pagar com Pix" leva a `pay.cakto.com.br/<oferta>?callback=<token assinado>`.
  - O webhook `/api/webhooks/cakto` verifica a assinatura HMAC (`X-Cakto-Signature`) e libera 1 período.
  - Código em `apps/web/lib/billing/cakto.ts` e testes em `cakto.test.ts`.
- **Checkouts da Cakto:** visual profissional, um por plano, com a imagem de cada plano.
  - Imagens em `apps/web/public/cakto/`, geradas por `scripts/gerar-imagens-cakto.cjs`.
- **Cron diário:** `/api/cron/daily`, às 06:15 BRT (plano Hobby da Vercel aceita só um cron por dia).

## Segurança — corrigido em 18/11 (migração `20261118000009_usage_hardening.sql`, já aplicada em produção)

A auditoria não achou acesso a dados de outros espaços, nem forma de ganhar plano pago ou virar admin. Corrigido:
- `reserve_usage` recusa chave repetida (`duplicate_request`). Antes, reenviar o mesmo pedido dava IA ilimitada.
- `settle_usage` foi revogado de usuários. A liquidação agora é feita só pelo servidor via `svc_settle_usage`, limitada ao valor reservado.
- A transcrição de voz é cobrada pela duração medida pelo provedor, não pela declarada pelo navegador.
- O fuso horário do espaço é validado por trigger; antes, um fuso inválido derrubava o cron de lembretes de todos.
- `request_report` exige plano pago para `full_pdf`/`xlsx`, e a chave de idempotência é por usuário.
- Convites: limite de 10 por hora. `/auth/confirm` não aceita mais `magiclink`/`invite`.

Pendências menores de segurança:
- Conferir também o `amount` do pedido Cakto contra o preço do plano.
- Exigir senha mínima no painel do Supabase Auth.
- Gravar mensagens da IA só pelo servidor (`append_message` com `role=assistant`).

## IDs da Cakto (conta eukanascimento@gmail.com)

| Produto | ID | Checkout | Oferta Pix 1 mês (ativa) |
|---|---|---|---|
| RUMO Pro | 88e703ab-55b9-419e-b97c-85094a044403 | 1340244 | e6abt66 (R$ 19,90) |
| RUMO Max | 77a7fbc5-add5-443e-9721-a64bfe56c462 | 1340315 | dr7c4pa (R$ 49,90) |
| RUMO Ilimitado | 90f064f1-6ea0-4cab-82d4-e61584e05e55 | 1340316 | 36upfur (R$ 149,90) |

- Ofertas antigas desativadas: `3cz9icc`, `dcfctb8`.
- Webhook Cakto id `85711` → `https://rumo-do-zero.vercel.app/api/webhooks/cakto`, nos 3 produtos.
- Eventos do webhook: `purchase_approved`, `refund`, `chargeback`, `dispute_defense_requested`, `pix_expirado`.
- O secret do webhook está na variável `CAKTO_WEBHOOK_SECRET` da Vercel.

Variáveis na Vercel hoje:
- Supabase, Stripe, `CRON_SECRET`, `RUMO_SERVICE_SECRET`, `ANALYTICS_URL`.
- `CAKTO_WEBHOOK_SECRET`, `CAKTO_OFFER_PRO_MONTH`, `CAKTO_OFFER_MAX_MONTH`, `CAKTO_OFFER_UNLIMITED_MONTH`.
- Sobra apagar: `STRIPE_SECRET_KEYSTRIPE_SECRET_KEY`, criada com o nome errado.

## Próximos passos (em ordem)

### 1. Assinaturas na Cakto (cartão + Pix Automático, mensal e anual) e desligar o Stripe
- **Bloqueio, a resolver pelo dono no painel da Cakto:** em cada um dos 3 produtos, deixar só **Pix, Pix Automático e Cartão de crédito**. A Cakto recusa oferta de assinatura com Apple/Google Pay, PicPay, Pagaleve, Cartão + Pix ou Dois cartões ativos, e a API ignora a mudança dessas formas de pagamento.
- **Depois disso, criar as ofertas:**
  - por produto: `type: subscription`, mensal (`intervalType month`, `recurrence_period 30`, `quantity_recurrences -1`) e anual (`recurrence_period 365`);
  - por produto: oferta `unique` anual para Pix (anual = 10 mensalidades: Pro R$ 199, Max R$ 499, Ilimitado R$ 1.499).
- **No app:**
  - Nova tabela `cakto_subscriptions (subscription_id pk, user_id, plan_code, interval, status, next_payment_date)`, com RLS e leitura só pelo dono.
  - No 1º `purchase_approved` com `data.subscription`, o callback assinado identifica o usuário: gravar o vínculo assinatura → usuário.
  - Em `subscription_renewed`/`purchase_approved` seguintes: achar o usuário pelo `data.subscription.id` e liberar o período. `source_ref = cakto:<id do pedido>` deixa isso idempotente.
  - `subscription_canceled`: marcar a assinatura como cancelada; o acesso vale até o fim do período pago.
  - `subscription_late` e `subscription_renewal_refused`: avisar o usuário.
  - Incluir esses eventos no webhook `85711`.
  - Formato real do payload: ver o histórico de eventos do webhook na Cakto. `data.subscription` traz `id`, `offer`, `status`, `next_payment_date`, `recurrence_period`, `paymentMethod`.
- **Cancelar pelo app:** `POST /public_api/subscriptions/{id}/cancel/`. Precisa de uma Chave de API da Cakto (escopos `subscriptions`, read/write) nas variáveis `CAKTO_CLIENT_ID`/`CAKTO_CLIENT_SECRET`, com o token OAuth em `POST /public_api/token/`.
- **Trocar no app:** o botão "Assinar com cartão" passa a usar a oferta de assinatura da Cakto. Depois, remover o Stripe (código em `lib/billing/stripe.ts`, `events.ts` e rotas `api/billing/portal` e `api/webhooks/stripe`).

### 2. E-mail (convites, lembretes, confirmação de pagamento)
- **Causa do convite não chegar:** não há serviço de e-mail configurado. Até lá, o convite mostra um link para copiar ou mandar no WhatsApp.
- **Sem domínio próprio, o caminho escolhido é o Gmail com senha de app:**
  1. O dono cria `SMTP_USER` e `SMTP_PASS` (Sensitive) na Vercel.
  2. Implementar o envio via SMTP (nodemailer, `smtp.gmail.com:465`) em `lib/cron/workers.ts` (`processOutbox`), mantendo o Resend como alternativa.
  3. Incluir `processOutbox` também no cron diário e após cada evento importante.

### 3. Páginas legais
- Preencher `[RAZÃO SOCIAL]`, `[CNPJ]` e `[FORO]` em `/termos` e `/privacidade`:
  - responsável: "Sal da Terra Online, operação digital (sem CNPJ)";
  - foro: domicílio do consumidor (CDC).
- Pedir ao dono o e-mail público de contato.
- Citar a Cakto como processadora de pagamentos na política de privacidade.

### 4. Bugs conhecidos (auditoria de 18/11)
- **Faltam telas:**
  - Editar/arquivar contas, categorias, cartões, dívidas, metas, orçamentos, contatos e propostas.
  - "Editar só esta" recorrência (`private.edit_commitment` já existe).
  - Vincular lançamento existente a uma proposta.
  - Custos do negócio (`rendas/page.tsx` envia `null`).
- **Exportações e relatórios:**
  - CSV depende do serviço Python: gerar em Node.
  - `processReports` nunca roda: incluir no cron diário.
- **Configurações:**
  - O horário de lembrete é salvo mas ignorado.
  - A exclusão de conta é só um esqueleto.
- **Celular e visual:**
  - O seletor de período fica escondido abaixo de 1024px.
  - A bússola decorativa ocupa espaço.
  - O modo "ocultar valores" não esconde valores dos gráficos.
- **Datas:** `new Date()` em UTC nas páginas de lançamentos e relatórios faz a data padrão virar "amanhã" depois das 21h.
- **Botão de voz:** o "ExplainScreen" aparece mesmo com voz desligada.
- **Site sem:** favicon, robots.txt, sitemap e imagem OG.

### 5. Funcionalidades novas sugeridas
1. Importar extrato OFX/CSV/Excel com revisão e sem duplicar.
2. Regras de categorização automática.
3. Calendário mensal de contas.
4. Envelopes de orçamento com sobra para o mês seguinte.
5. Previsão de caixa em TypeScript/SQL, para não depender do Python.
6. Módulo MEI: DRE, aviso do DAS, limite de R$ 81 mil, DASN-SIMEI.
7. Cobranças com Pix para os clientes do usuário.
8. Lembretes por e-mail e WhatsApp.
9. Simulador de metas com CDI/Selic.
10. Open Finance (Pluggy/Belvo), mais para frente.

### 6. Visual 3D, física e vídeos
- Pedidos do dono:
  - cena 3D interativa com física na página inicial;
  - gráficos 3D e animações dentro do painel;
  - vídeos de apresentação e tutoriais em **Remotion** (motion graphics).
- **Já existe:**
  - three 0.187, @react-three/fiber 9, drei 10, @react-three/rapier 2, gsap 3, motion 14, echarts 6;
  - bússola 3D com física na página inicial (`components/three/hero-scene.tsx`) e bússola no painel (`scene-layer.tsx`).
- **Modelos GLB de inspiração:** na pasta do OneDrive do dono, cujo link ele tem. A sessão na nuvem não conseguia acessar o OneDrive. Na sessão local, peça a pasta sincronizada e copie os GLBs úteis para `apps/web/public/models/`, comprimindo com gltf-transform/Draco.
- **Cuidados:**
  - respeitar `prefers-reduced-motion`;
  - ter fallback sem WebGL;
  - manter as metas de LCP/INP.

### 7. IA e voz
- Ficam desligadas até:
  - cadastrar `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` na Vercel;
  - um admin da plataforma definir o teto mensal de custo em `/app/admin`.
- Para virar admin: `update public.profiles set is_platform_admin = true where id = '<uuid do usuário>'`, rodado no SQL Editor do Supabase.
