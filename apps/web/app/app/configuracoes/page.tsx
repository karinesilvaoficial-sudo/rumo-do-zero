import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getCtx } from "@/lib/workspace";
import { Danger, ExportAll, NotifPrefs, Prefs } from "./client";

export const metadata = { title: "Configurações" };

export default async function Page() {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  const sb = await supabaseServer();
  const [{ data: prof }, { data: prefs }] = await Promise.all([
    sb.from("profiles").select("full_name,timezone,reduce_motion,hide_values").eq("id", ctx.user.id).single(),
    sb.from("notification_preferences").select("kind,in_app,email,include_amounts,send_hour").eq("user_id", ctx.user.id),
  ]);
  return (
    <>
      <div className="page-head"><div><h1>Configurações</h1><p>Perfil, preferências, notificações, privacidade e dados.</p></div></div>
      <section className="card"><div className="card-header"><h2>Perfil e preferências</h2></div><Prefs profile={prof!} /></section>
      <section className="card"><div className="card-header"><h2>Notificações</h2></div><NotifPrefs prefs={prefs ?? []} /></section>
      <section className="card"><div className="card-header"><h2>Seus dados</h2></div>
        {ctx.active ? <ExportAll workspaceId={ctx.active.id} workspaceName={ctx.active.name} /> : <p className="muted">Nenhum espaço ativo.</p>}
        <p className="small muted" style={{ marginTop: 8 }}>A exportação em CSV dos seus registros está disponível em todos os planos, inclusive após mudar para um plano menor.</p>
      </section>
      <section className="card" style={{ borderColor: "#f1c4bf" }}><div className="card-header"><h2>Excluir conta</h2></div><Danger /></section>
    </>
  );
}
