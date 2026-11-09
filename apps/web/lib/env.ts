import "server-only";
import { z } from "zod";

/**
 * Configuração validada por ambiente. Variáveis públicas (NEXT_PUBLIC_*) vs. privadas (somente servidor).
 * Integrações sem configuração ficam DESLIGADAS com mensagem clara — nunca simuladas.
 */
const opt = z.string().trim().min(1).optional();

const ServerEnv = z.object({
  APP_ENV: z.enum(["development", "test", "preview", "production"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: opt,
  SUPABASE_SECRET_KEY: opt, // somente webhooks, cron e filas — nunca em consultas de usuário
  ANALYTICS_URL: z.url().optional(),
  RUMO_SERVICE_SECRET: z.string().min(32).optional(),
  ANTHROPIC_API_KEY: opt,
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-5-5"),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(256).max(8000).default(1000),
  ELEVENLABS_API_KEY: opt,
  ELEVENLABS_VOICE_ID: opt,
  ELEVENLABS_TTS_MODEL: z.string().default("eleven_v4_turbo"),
  ELEVENLABS_STT_MODEL: z.string().default("scribe_v2"),
  AUDIO_RECORDING_RETENTION_HOURS: z.coerce.number().int().min(0).max(168).default(24),
  STRIPE_SECRET_KEY: opt,
  STRIPE_WEBHOOK_SECRET: opt,
  STRIPE_PRICE_PRO_MONTH: opt,
  STRIPE_PRICE_PRO_YEAR: opt,
  STRIPE_PRICE_MAX_MONTH: opt,
  STRIPE_PRICE_MAX_YEAR: opt,
  STRIPE_PRICE_UNLIMITED_MONTH: opt,
  STRIPE_PRICE_UNLIMITED_YEAR: opt,
  STRIPE_PIX_ENABLED: z.enum(["true", "false"]).default("false"),
  RESEND_API_KEY: opt,
  EMAIL_FROM: opt,
  CRON_SECRET: z.string().min(32).optional(),
});
export type ServerEnv = z.infer<typeof ServerEnv>;

let cached: ServerEnv | null = null;
export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = ServerEnv.safeParse(process.env);
  if (!parsed.success) {
    // não imprime valores, só nomes dos campos inválidos
    throw new Error("invalid_env: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  }
  if (parsed.data.APP_ENV === "production" && parsed.data.NEXT_PUBLIC_APP_URL.startsWith("http://")) {
    throw new Error("invalid_env: NEXT_PUBLIC_APP_URL must be https in production");
  }
  cached = parsed.data;
  return cached;
}

export type Integration = "supabase" | "admin_db" | "analytics" | "ai" | "voice" | "billing" | "email" | "cron";

export function integrationStatus(): Record<Integration, boolean> {
  const e = env();
  return {
    supabase: Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    admin_db: Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.SUPABASE_SECRET_KEY),
    analytics: Boolean(e.ANALYTICS_URL && e.RUMO_SERVICE_SECRET),
    ai: Boolean(e.ANTHROPIC_API_KEY),
    voice: Boolean(e.ELEVENLABS_API_KEY && e.ELEVENLABS_VOICE_ID),
    billing: Boolean(e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET && e.STRIPE_PRICE_PRO_MONTH),
    email: Boolean(e.RESEND_API_KEY && e.EMAIL_FROM),
    cron: Boolean(e.CRON_SECRET),
  };
}

export class NotConfiguredError extends Error {
  constructor(public readonly integration: Integration) {
    super(`not_configured:${integration}`);
  }
}

export function requireIntegration(i: Integration): ServerEnv {
  if (!integrationStatus()[i]) throw new NotConfiguredError(i);
  return env();
}
