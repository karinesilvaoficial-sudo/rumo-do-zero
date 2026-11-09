import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { IntentPayloads, type IntentTool } from "@rumo/contracts";
import { z } from "zod";
import { analytics } from "@/lib/analytics";
import * as data from "@/lib/data";
import { integrationStatus } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Ferramentas da RUMO IA. Consultas leem dados canônicos sob RLS do usuário e do ESPAÇO ATIVO
 * (o modelo nunca escolhe o espaço). Ferramentas "preparar_*" apenas registram uma intenção:
 * nada é gravado até a confirmação explícita do usuário na interface.
 */
const S = (props: Record<string, unknown>, required = Object.keys(props)) => ({ type: "object" as const, properties: props, required, additionalProperties: false });
const date = { type: "string", description: "Data AAAA-MM-DD" };
const cents = { type: "string", description: "Centavos como inteiro em texto (R$ 12,34 = \"1234\")" };
const nullable = (t: Record<string, unknown>) => ({ ...t, type: [t.type as string, "null"] });

export const TOOLS: Anthropic.Tool[] = [
  { name: "consultar_resumo", description: "Resumo financeiro canônico do espaço ativo em um período (receitas, despesas, resultado, caixa, saldo, pendências) e maiores categorias de despesa.", input_schema: S({ de: date, ate: date }), strict: true },
  { name: "listar_vencimentos", description: "Compromissos e faturas pendentes até N dias à frente (inclui vencidos).", input_schema: S({ dias: { type: "integer", minimum: 1, maximum: 120 } }), strict: true },
  { name: "listar_lancamentos", description: "Lançamentos realizados do espaço ativo (máx. 30), com filtros.", input_schema: S({ de: date, ate: date, tipo: nullable({ type: "string", enum: ["income", "expense", null] }), busca: nullable({ type: "string" }) }), strict: true },
  { name: "listar_metas", description: "Metas do espaço ativo com valor-alvo, guardado e prazo.", input_schema: S({}), strict: true },
  { name: "simular_divida", description: "Simulação determinística de quitação. Taxa mensal desconhecida deve ser null (a simulação ficará incompleta; nunca assuma zero).", input_schema: S({ saldo_centavos: cents, taxa_mensal: nullable({ type: "string", description: "Fração ao mês, ex. \"0.0299\"" }), parcela_centavos: nullable(cents) }), strict: true },
  { name: "planejar_meta", description: "Cálculo determinístico de aporte mensal necessário e prazo para uma meta.", input_schema: S({ meta_centavos: cents, guardado_centavos: cents, prazo: nullable(date), aporte_mensal_centavos: nullable(cents) }), strict: true },
  { name: "preparar_meta", description: "PREPARA a criação de uma meta (não grava; o usuário confirma).", input_schema: S({ nome: { type: "string" }, valor_centavos: cents, prazo: nullable(date), resumo: { type: "string" } }), strict: true },
  { name: "preparar_categoria", description: "PREPARA a alteração da categoria de um lançamento (use ids e versão obtidos de listar_lancamentos).", input_schema: S({ transacao_id: { type: "string" }, categoria_id: { type: "string" }, versao: { type: "integer" }, resumo: { type: "string" } }), strict: true },
  { name: "preparar_orcamento", description: "PREPARA um orçamento mensal para uma categoria de despesa.", input_schema: S({ categoria_id: { type: "string" }, mes: date, valor_centavos: cents, resumo: { type: "string" } }), strict: true },
  { name: "preparar_compromisso", description: "PREPARA uma conta a pagar ou a receber.", input_schema: S({ direcao: { type: "string", enum: ["payable", "receivable"] }, descricao: { type: "string" }, categoria_id: nullable({ type: "string" }), valor_centavos: cents, vencimento: date, resumo: { type: "string" } }), strict: true },
  { name: "preparar_lancamento", description: "PREPARA um lançamento realizado (receita ou despesa) a partir do que o usuário descreveu.", input_schema: S({ tipo: { type: "string", enum: ["income", "expense"] }, descricao: { type: "string" }, valor_centavos: cents, conta_id: { type: "string" }, categoria_id: nullable({ type: "string" }), data: date, resumo: { type: "string" } }), strict: true },
  { name: "preparar_tarefa", description: "PREPARA uma tarefa do plano de ação.", input_schema: S({ titulo: { type: "string" }, prazo: nullable(date), resumo: { type: "string" } }), strict: true },
  { name: "gerar_documento", description: "Entrega um documento (proposta, descrição de serviço, orçamento, texto de abordagem, roteiro de divulgação, plano). O usuário revisa e decide salvar; nada é enviado a terceiros.", input_schema: S({ tipo: { type: "string", enum: ["proposal", "service_description", "quote", "outreach", "promo_script", "plan", "narrative_report"] }, titulo: { type: "string" }, conteudo: { type: "string", description: "Markdown simples" } }), strict: true },
];

export type ToolCtx = { userId: string; workspaceId: string; conversationId: string | null };
export type Proposed = { intent_id: string; payload_hash: string; expires_at: string; tool: IntentTool; summary: string; payload: Record<string, unknown> };
export type DocDraft = { kind: string; title: string; body: string };
export type ToolOutcome = { content: string; source?: string; intent?: Proposed; document?: DocDraft; isError?: boolean };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const toIntent: Record<string, (i: Record<string, unknown>) => [IntentTool, Record<string, unknown>]> = {
  preparar_meta: (i) => ["create_goal", { name: i.nome, target_cents: i.valor_centavos, target_date: i.prazo ?? null }],
  preparar_categoria: (i) => ["categorize_transaction", { transaction_id: i.transacao_id, category_id: i.categoria_id, expected_version: i.versao }],
  preparar_orcamento: (i) => ["upsert_budget", { category_id: i.categoria_id, month: String(i.mes).slice(0, 8) + "01", amount_cents: i.valor_centavos }],
  preparar_compromisso: (i) => ["create_commitment", { direction: i.direcao, description: i.descricao, category_id: i.categoria_id ?? null, amount_cents: i.valor_centavos, due_date: i.vencimento }],
  preparar_lancamento: (i) => ["record_transaction", { kind: i.tipo, description: i.descricao, amount_cents: i.valor_centavos, account_id: i.conta_id, category_id: i.categoria_id ?? null, date: i.data }],
  preparar_tarefa: (i) => ["create_task", { title: i.titulo, due_date: i.prazo ?? null }],
};

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolCtx): Promise<ToolOutcome> {
  const ws = ctx.workspaceId;
  try {
    switch (name) {
      case "consultar_resumo": {
        const de = String(input.de), ate = String(input.ate);
        if (!ISO.test(de) || !ISO.test(ate) || de > ate) return { content: "Período inválido.", isError: true };
        const [s, b] = await Promise.all([data.summary(ws, de, ate), data.breakdown(ws, de, ate, "expense")]);
        return { content: JSON.stringify({ resumo: s, maiores_despesas: b.slice(0, 8) }), source: `resumo ${de}..${ate}` };
      }
      case "listar_vencimentos": {
        const dias = Math.min(120, Math.max(1, Number(input.dias) || 15));
        const until = new Date(Date.now() + dias * 864e5).toISOString().slice(0, 10);
        return { content: JSON.stringify(await data.upcoming(ws, until)), source: `vencimentos até ${until}` };
      }
      case "listar_lancamentos": {
        const sb = await supabaseServer();
        let q = sb.from("transactions").select("id,kind,amount_cents,description,competence_date,category_id,version,categories(name)")
          .eq("workspace_id", ws).is("reversed_at", null).is("reversal_of", null).gte("competence_date", String(input.de)).lte("competence_date", String(input.ate))
          .order("competence_date", { ascending: false }).limit(30);
        if (input.tipo) q = q.eq("kind", String(input.tipo));
        if (input.busca) q = q.ilike("description", `%${String(input.busca).replace(/[%_,()]/g, " ").slice(0, 60)}%`);
        const { data: rows, error } = await q;
        if (error) throw error;
        return { content: JSON.stringify((rows ?? []).map((r) => ({ ...r, amount_cents: String(r.amount_cents) }))), source: `lançamentos ${input.de}..${input.ate}` };
      }
      case "listar_metas":
        return { content: JSON.stringify(await data.goals(ws)), source: "metas" };
      case "simular_divida": {
        if (!integrationStatus().analytics) return { content: "Serviço de cálculo indisponível; não estime valores.", isError: true };
        const r = await analytics("/v1/debts/simulate", { userId: ctx.userId, workspaceId: ws }, { outstanding_cents: input.saldo_centavos, monthly_rate: input.taxa_mensal, payment_cents: input.parcela_centavos });
        return { content: JSON.stringify(r), source: "simulação de dívida (serviço de cálculo)" };
      }
      case "planejar_meta": {
        if (!integrationStatus().analytics) return { content: "Serviço de cálculo indisponível; não estime valores.", isError: true };
        const r = await analytics("/v1/goals/plan", { userId: ctx.userId, workspaceId: ws }, { target_cents: input.meta_centavos, saved_cents: input.guardado_centavos, today: new Date().toISOString().slice(0, 10), target_date: input.prazo, monthly_contribution_cents: input.aporte_mensal_centavos });
        return { content: JSON.stringify(r), source: "plano de meta (serviço de cálculo)" };
      }
      case "gerar_documento":
        return { content: "Documento entregue ao usuário para revisão.", document: { kind: String(input.tipo), title: String(input.titulo).slice(0, 160), body: String(input.conteudo).slice(0, 60000) } };
      default: {
        const map = toIntent[name];
        if (!map) return { content: "Ferramenta desconhecida.", isError: true };
        const [tool, payload] = map(input);
        const parsed = IntentPayloads[tool].safeParse(payload);
        if (!parsed.success) return { content: `Dados inválidos: ${z.prettifyError(parsed.error).slice(0, 400)}`, isError: true };
        const summary = String(input.resumo ?? "").slice(0, 300) || tool;
        const sb = await supabaseServer();
        const { data: prep, error } = await sb.rpc("prepare_intent", { ws, p_conversation_id: ctx.conversationId, p_tool: tool, p_payload: parsed.data, p_summary: summary });
        if (error) throw error;
        const p = prep as { intent_id: string; payload_hash: string; expires_at: string };
        return { content: `Proposta registrada (id ${p.intent_id}). NÃO foi executada: aguarda confirmação do usuário na interface.`, intent: { ...p, tool, summary, payload: parsed.data as Record<string, unknown> } };
      }
    }
  } catch (e) {
    return { content: `Falha ao consultar (${(e as { message?: string }).message?.slice(0, 80) ?? "erro"}). Não invente valores.`, isError: true };
  }
}
