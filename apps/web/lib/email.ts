import "server-only";
import { Resend } from "resend";
import { requireIntegration } from "@/lib/env";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Template responsivo mínimo: só o necessário; sem relatórios privados anexados. */
export function renderEmail(title: string, body: string, cta?: { href: string; label: string }) {
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F5F8FF;font-family:Manrope,Segoe UI,Arial,sans-serif;color:#14233B">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #DCE5F3;border-radius:16px"><tr><td style="padding:28px">
<p style="margin:0 0 20px;font-weight:700;font-size:20px;letter-spacing:.02em"><span style="color:#1F57FF">▲</span> RUMO</p>
<h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
<p style="font-size:15px;line-height:1.6;color:#52627A;margin:0 0 20px">${esc(body)}</p>
${cta ? `<a href="${esc(cta.href.startsWith("http") ? cta.href : app + cta.href)}" style="display:inline-block;background:#1F57FF;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:10px">${esc(cta.label)}</a>` : ""}
<p style="font-size:12px;color:#52627A;margin:28px 0 0">Você recebe este e-mail por causa da sua conta no RUMO. Ajuste as preferências em Configurações.</p>
</td></tr></table></td></tr></table></body></html>`;
}

export async function sendEmail(to: string, subject: string, html: string, idempotencyKey: string): Promise<string> {
  const e = requireIntegration("email");
  const r = await new Resend(e.RESEND_API_KEY!).emails.send({ from: e.EMAIL_FROM!, to, subject, html }, { idempotencyKey });
  if (r.error) throw new Error(`resend:${r.error.name}`);
  return r.data?.id ?? "";
}
