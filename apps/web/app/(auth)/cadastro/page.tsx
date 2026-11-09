import { safeNext } from "@/lib/safe-redirect";
import { publicAuthConfig } from "../auth-config";
import { SignupForm } from "../auth-forms";

export const metadata = { title: "Criar conta" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; plano?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next, sp.plano ? `/app/assinatura?plano=${encodeURIComponent(sp.plano)}` : "/app/onboarding");
  return <SignupForm cfg={publicAuthConfig()} next={next} />;
}
