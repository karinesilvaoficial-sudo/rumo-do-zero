"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { PublicAuthConfig } from "./auth-config";

function useSb(cfg: PublicAuthConfig) {
  return useMemo(() => (cfg.configured ? supabaseBrowser(cfg.url, cfg.key) : null), [cfg]);
}

const AUTH_ERRORS: Record<string, string> = {
  "Invalid login credentials": "E-mail ou senha incorretos.",
  "Email not confirmed": "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.",
  "User already registered": "Já existe uma conta com este e-mail. Entre ou recupere sua senha.",
};
const msg = (m: string) => AUTH_ERRORS[m] ?? (m.toLowerCase().includes("rate") ? "Muitas tentativas. Aguarde alguns minutos." : "Não foi possível concluir. Tente novamente.");

function GoogleButton({ cfg, next }: { cfg: PublicAuthConfig; next: string }) {
  const sb = useSb(cfg);
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="btn btn-secondary oauth-btn" disabled={!sb || busy} aria-busy={busy}
      onClick={async () => {
        setBusy(true);
        await sb?.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${cfg.appUrl}/auth/callback?next=${encodeURIComponent(next)}` } });
      }}>
      <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z"/></svg>
      Continuar com Google
    </button>
  );
}

export function LoginForm({ cfg, next }: { cfg: PublicAuthConfig; next: string }) {
  const sb = useSb(cfg);
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      if (!sb) return;
      const f = new FormData(e.currentTarget);
      setBusy(true); setErr(null);
      const { error } = await sb.auth.signInWithPassword({ email: String(f.get("email")), password: String(f.get("password")) });
      if (error) { setErr(msg(error.message)); setBusy(false); return; }
      router.replace(next);
      router.refresh();
    }}>
      <div><h1>Entrar</h1><p className="muted" style={{ marginTop: 6 }}>Bem-vindo de volta ao RUMO.</p></div>
      {!cfg.configured ? <Alert tone="warn">Autenticação ainda não configurada neste ambiente.</Alert> : null}
      <GoogleButton cfg={cfg} next={next} />
      <div className="or">ou com e-mail</div>
      {err ? <Alert tone="error">{err}</Alert> : null}
      <div className="field"><label htmlFor="email">E-mail</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
      <div className="field"><label htmlFor="password">Senha</label><input className="input" id="password" name="password" type="password" autoComplete="current-password" required minLength={8} /></div>
      <button className="btn btn-primary" type="submit" disabled={!sb || busy} aria-busy={busy}>{busy ? "Entrando…" : "Entrar"}</button>
      <div className="row small" style={{ justifyContent: "space-between" }}>
        <Link href="/recuperar">Esqueci minha senha</Link>
        <Link href={`/cadastro?next=${encodeURIComponent(next)}`}>Criar conta</Link>
      </div>
    </form>
  );
}

export function SignupForm({ cfg, next }: { cfg: PublicAuthConfig; next: string }) {
  const sb = useSb(cfg);
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (sent) return (
    <div className="stack" role="status">
      <h1>Confirme seu e-mail</h1>
      <p className="muted">Enviamos um link de confirmação para <strong>{sent}</strong>. Abra-o para ativar sua conta. O link expira em algumas horas.</p>
      <Link className="btn btn-secondary" href="/entrar">Ir para o login</Link>
    </div>
  );
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      if (!sb) return;
      const f = new FormData(e.currentTarget);
      const email = String(f.get("email"));
      if (String(f.get("password")) !== String(f.get("password2"))) { setErr("As senhas não coincidem."); return; }
      setBusy(true); setErr(null);
      const { data, error } = await sb.auth.signUp({ email, password: String(f.get("password")), options: {
        data: { full_name: String(f.get("name")).slice(0, 120) },
        emailRedirectTo: `${cfg.appUrl}/auth/confirm?next=${encodeURIComponent(next)}`,
      } });
      setBusy(false);
      if (error) { setErr(msg(error.message)); return; }
      // projetos sem confirmação de e-mail já devolvem sessão: segue direto ao onboarding
      if (data.session) { router.replace(next); router.refresh(); return; }
      setSent(email);
    }}>
      <div><h1>Criar conta</h1><p className="muted" style={{ marginTop: 6 }}>Grátis, sem cartão e sem prazo de expiração.</p></div>
      {!cfg.configured ? <Alert tone="warn">Autenticação ainda não configurada neste ambiente.</Alert> : null}
      <GoogleButton cfg={cfg} next={next} />
      <div className="or">ou com e-mail</div>
      {err ? <Alert tone="error">{err}</Alert> : null}
      <div className="field"><label htmlFor="name">Nome</label><input className="input" id="name" name="name" autoComplete="name" required maxLength={120} /></div>
      <div className="field"><label htmlFor="email">E-mail</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
      <div className="field"><label htmlFor="password">Senha</label><input className="input" id="password" name="password" type="password" autoComplete="new-password" required minLength={10} aria-describedby="pw-hint" /><span id="pw-hint" className="hint">Mínimo de 10 caracteres.</span></div>
      <div className="field"><label htmlFor="password2">Confirme a senha</label><input className="input" id="password2" name="password2" type="password" autoComplete="new-password" required minLength={10} /></div>
      <button className="btn btn-primary" type="submit" disabled={!sb || busy} aria-busy={busy}>{busy ? "Criando…" : "Criar conta"}</button>
      <p className="small muted">Ao criar a conta, você concorda com os <Link href="/termos">Termos</Link> e a <Link href="/privacidade">Política de privacidade</Link>.</p>
      <p className="small">Já tem conta? <Link href="/entrar">Entrar</Link></p>
    </form>
  );
}

export function RecoverForm({ cfg }: { cfg: PublicAuthConfig }) {
  const sb = useSb(cfg);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  if (done) return <div className="stack" role="status"><h1>Verifique seu e-mail</h1><p className="muted">Se existir uma conta com este e-mail, enviamos um link para redefinir a senha.</p><Link href="/entrar">Voltar ao login</Link></div>;
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      if (!sb) return;
      setBusy(true);
      // resposta igual exista ou não a conta (não revela cadastro)
      await sb.auth.resetPasswordForEmail(String(new FormData(e.currentTarget).get("email")), { redirectTo: `${cfg.appUrl}/auth/confirm?next=/redefinir-senha` });
      setDone(true);
    }}>
      <h1>Recuperar senha</h1>
      <div className="field"><label htmlFor="email">E-mail da conta</label><input className="input" id="email" name="email" type="email" required autoComplete="email" /></div>
      <button className="btn btn-primary" disabled={!sb || busy} aria-busy={busy}>{busy ? "Enviando…" : "Enviar link"}</button>
      <Link className="small" href="/entrar">Voltar</Link>
    </form>
  );
}

export function ResetForm({ cfg }: { cfg: PublicAuthConfig }) {
  const sb = useSb(cfg);
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      if (!sb) return;
      const f = new FormData(e.currentTarget);
      if (f.get("password") !== f.get("password2")) { setErr("As senhas não coincidem."); return; }
      setBusy(true);
      const { error } = await sb.auth.updateUser({ password: String(f.get("password")) });
      setBusy(false);
      if (error) { setErr(error.message.includes("session") ? "O link expirou. Solicite um novo." : msg(error.message)); return; }
      router.replace("/app");
    }}>
      <h1>Nova senha</h1>
      {err ? <Alert tone="error">{err}</Alert> : null}
      <div className="field"><label htmlFor="password">Nova senha</label><input className="input" id="password" name="password" type="password" minLength={10} required autoComplete="new-password" /></div>
      <div className="field"><label htmlFor="password2">Confirme</label><input className="input" id="password2" name="password2" type="password" minLength={10} required autoComplete="new-password" /></div>
      <button className="btn btn-primary" disabled={!sb || busy} aria-busy={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</button>
    </form>
  );
}
