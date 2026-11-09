import { z } from "zod";
import raw from "./plans.json" with { type: "json" };

export const PlanCode = z.enum(["free", "pro", "max", "unlimited"]);
export type PlanCode = z.infer<typeof PlanCode>;

export const Plan = z.object({
  code: PlanCode,
  name: z.string(),
  rank: z.number().int(),
  monthly_cents: z.number().int().nonnegative(),
  annual_cents: z.number().int().nonnegative(),
  max_workspaces: z.number().int().nullable(),
  max_entries_month: z.number().int().nullable(),
  max_active_goals: z.number().int().nullable(),
  max_guests: z.number().int(),
  ai_credits_month: z.number().int(),
  tts_seconds_month: z.number().int(),
  stt_seconds_month: z.number().int(),
  storage_bytes: z.number().int(),
  analysis: z.string(),
  income: z.string(),
  pdf: z.string(),
});
export type Plan = z.infer<typeof Plan>;

export const PLANS: readonly Plan[] = z.object({ plans: z.array(Plan).length(4) }).parse(raw).plans;
export const PLAN_NOTE: string = raw.note;

export function planByCode(code: PlanCode): Plan {
  const p = PLANS.find((x) => x.code === code);
  if (!p) throw new Error("plan_not_found");
  return p;
}

export function formatLimit(v: number | null, unit = ""): string {
  return v === null ? "Sem limite comercial fixo" : `${v.toLocaleString("pt-BR")}${unit}`;
}

export function formatBytes(b: number): string {
  return b >= 1024 ** 3 ? `${b / 1024 ** 3} GB` : `${b / 1024 ** 2} MB`;
}
