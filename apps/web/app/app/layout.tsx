import { redirect } from "next/navigation";
import { getPeriod } from "@/lib/period-server";
import { getCtx } from "@/lib/workspace";
import { Shell } from "./shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  const period = await getPeriod({}, ctx.active?.timezone ?? "America/Sao_Paulo");
  return (
    <Shell
      user={{ email: ctx.user.email, name: ctx.profile.full_name, isAdmin: ctx.profile.is_platform_admin }}
      workspaces={ctx.workspaces.map((w) => ({ id: w.id, name: w.name, kind: w.kind, role: w.role, readOnly: w.read_only }))}
      activeId={ctx.active?.id ?? null}
      hideValues={ctx.profile.hide_values}
      reduceMotion={ctx.profile.reduce_motion}
      period={{ key: period.key, label: period.label }}
    >
      {children}
    </Shell>
  );
}
