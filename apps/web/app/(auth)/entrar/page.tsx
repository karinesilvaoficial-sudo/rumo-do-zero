import { safeNext } from "@/lib/safe-redirect";
import { publicAuthConfig } from "../auth-config";
import { LoginForm } from "../auth-forms";

export const metadata = { title: "Entrar" };

const ERRORS: Record<string, string> = {
  oauth: "Não foi possível entrar com o Google. Tente de novo ou use e-mail e senha.",
  link: "Este link expirou ou já foi usado. Peça um novo ou entre com sua senha.",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; plano?: string; erro?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, sp.plano ? `/app/assinatura?plano=${encodeURIComponent(sp.plano)}` : "/app");
  const msg = sp.erro ? ERRORS[sp.erro] : undefined;
  return (
    <>
      {msg ? <div className="alert alert-warn" role="alert" style={{ maxWidth: 440, margin: "16px auto 0" }}>{msg}</div> : null}
      <LoginForm cfg={publicAuthConfig()} next={next} />
    </>
  );
}
