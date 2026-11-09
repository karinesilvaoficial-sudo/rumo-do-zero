import { safeNext } from "@/lib/safe-redirect";
import { publicAuthConfig } from "../auth-config";
import { LoginForm } from "../auth-forms";

export const metadata = { title: "Entrar" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; plano?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, sp.plano ? `/app/assinatura?plano=${encodeURIComponent(sp.plano)}` : "/app");
  return <LoginForm cfg={publicAuthConfig()} next={next} />;
}
