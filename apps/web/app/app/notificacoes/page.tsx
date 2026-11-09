import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getCtx } from "@/lib/workspace";
import { MarkRead } from "./mark";

export const metadata = { title: "Notificações" };

export default async function Page() {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  const sb = await supabaseServer();
  const { data } = await sb.from("notifications").select("id,title,body,link,read_at,created_at").order("created_at", { ascending: false }).limit(50);
  return (
    <>
      <div className="page-head"><div><h1>Notificações</h1><p>Avisos do aplicativo. Preferências em Configurações.</p></div><MarkRead /></div>
      <section className="card">
        {(data ?? []).length === 0 ? <p className="muted">Nenhuma notificação.</p> : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }} className="stack">{(data ?? []).map((n) => (
            <li key={n.id} style={{ borderBottom: "1px solid var(--rumo-border)", paddingBottom: 10 }}>
              <strong>{n.read_at ? null : <span className="badge" style={{ marginRight: 6 }}>Nova</span>}{n.title}</strong>
              <p className="small muted">{n.body} · {new Date(n.created_at).toLocaleString("pt-BR")}</p>
              {n.link ? <Link className="small" href={n.link}>Abrir</Link> : null}
            </li>
          ))}</ul>
        )}
      </section>
    </>
  );
}
