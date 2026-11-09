import { redirect } from "next/navigation";
import { todayIn } from "@/lib/period";
import { getCtx } from "@/lib/workspace";
import { OnboardingForm } from "./form";

export const metadata = { title: "Primeiros passos" };

export default async function Page() {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  const st = ctx.profile.onboarding_state as { done?: boolean };
  if (st.done && ctx.active) redirect("/app");
  return (
    <>
      <div className="page-head"><div><h1>Vamos começar</h1><p>Leva menos de um minuto. Campos que você não souber podem ficar em branco — você completa depois.</p></div></div>
      <OnboardingForm today={todayIn()} hasPersonal={ctx.workspaces.some((w) => w.kind === "personal" && w.owner_id === ctx.user.id)} />
    </>
  );
}
