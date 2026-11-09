import { z } from "zod";

const uuid = z.uuid();
const centsStr = z.string().regex(/^\d{1,13}$/, "centavos positivos como string");
const isoDate = z.iso.date();

/** Ferramentas que PREPARAM alterações (nunca gravam). A confirmação executa no banco via confirm_intent. */
export const IntentPayloads = {
  create_goal: z.object({ name: z.string().min(1).max(80), target_cents: centsStr, target_date: isoDate.nullable().optional() }).strict(),
  categorize_transaction: z.object({ transaction_id: uuid, category_id: uuid, expected_version: z.number().int().positive() }).strict(),
  upsert_budget: z.object({ category_id: uuid, month: isoDate, amount_cents: centsStr }).strict(),
  create_commitment: z.object({
    direction: z.enum(["payable", "receivable"]), description: z.string().min(1).max(200),
    category_id: uuid.nullable().optional(), amount_cents: centsStr, due_date: isoDate,
  }).strict(),
  record_transaction: z.object({
    kind: z.enum(["income", "expense"]), amount_cents: centsStr, description: z.string().min(1).max(200),
    category_id: uuid.nullable().optional(), account_id: uuid, date: isoDate,
  }).strict(),
  create_task: z.object({ title: z.string().min(1).max(200), due_date: isoDate.nullable().optional() }).strict(),
} as const;
export type IntentTool = keyof typeof IntentPayloads;
export const INTENT_TOOLS = Object.keys(IntentPayloads) as IntentTool[];

/** Crédito padrão: até 4.000 tokens de entrada + 1.000 de saída somados por geração (seção 13). */
export const CREDIT = { inputTokens: 4000, outputTokens: 1000 } as const;

export function creditsFor(inputTokens: number, outputTokens: number): number {
  return Math.max(1, Math.ceil(inputTokens / CREDIT.inputTokens), Math.ceil(outputTokens / CREDIT.outputTokens));
}

export const DocumentKind = z.enum(["proposal", "service_description", "quote", "outreach", "promo_script", "plan", "narrative_report"]);

export const IncomePath = z.object({
  title: z.string().min(1).max(120),
  path_type: z.enum(["services", "freelance", "products", "digital_services", "assets", "business_sales"]),
  rationale: z.string().min(1).max(2000),
  offer: z.string().min(1).max(1000),
  target_customer: z.string().min(1).max(1000),
  resources: z.string().min(1).max(1000),
  investment_min_cents: z.string().regex(/^\d{1,13}$/).nullable(),
  investment_max_cents: z.string().regex(/^\d{1,13}$/).nullable(),
  assumptions: z.string().min(1).max(2000),
  time_needed: z.string().min(1).max(500),
  limitations: z.string().min(1).max(1000),
  validation_experiment: z.string().min(1).max(1000),
  plan_7d: z.array(z.string().min(1).max(200)).min(3).max(10),
  plan_30d: z.array(z.string().min(1).max(200)).min(3).max(12),
  decision_metric: z.string().min(1).max(500),
}).strict();
export type IncomePath = z.infer<typeof IncomePath>;
