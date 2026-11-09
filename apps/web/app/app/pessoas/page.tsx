import { redirect } from "next/navigation";
import { fmtDate } from "@/lib/period";
import { supabaseServer } from "@/lib/supabase/server";
import { canAdmin, getCtx, ROLE_LABEL, type Role } from "@/lib/workspace";
import { InviteForm, MemberActions, RevokeInvite } from "./client";

export const metadata = { title: "Pessoas e permissões" };

export default async function Page() {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  if (!ctx.active) redirect("/app/onboarding");
  const ws = ctx.active;
  const admin = canAdmin(ws.role);
  const sb = await supabaseServer();
  const [{ data: members }, { data: invites }, { data: audit }, ent] = await Promise.all([
    sb.from("memberships").select("user_id,role,created_at").eq("workspace_id", ws.id).order("created_at"),
    admin ? sb.from("invitations").select("id,email,role,expires_at,accepted_at,revoked_at,created_at").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
    admin ? sb.from("audit_log").select("action,entity,created_at,actor_id,detail").eq("workspace_id", ws.id).order("created_at", { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
    sb.rpc("my_entitlements"),
  ]);
  const guests = (ent.data as { usage?: { guests?: number }; limits?: { max_guests?: number } } | null);
  const now = new Date().toISOString();
  return (
    <>
      <div className="page-head"><div><h1>Pessoas e permissões</h1><p>Membros de <strong>{ws.name}</strong>. Cada espaço tem seus próprios membros: participar deste espaço não dá acesso aos demais.</p></div></div>
      <section className="card" aria-labelledby="m">
        <div className="card-header"><h2 id="m">Membros</h2>{ws.owner_id === ctx.user.id && guests?.limits ? <span className="small muted">Convidados na assinatura: {guests.usage?.guests ?? 0} de {guests.limits.max_guests}</span> : null}</div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Pessoa</th><th>Papel</th><th>Desde</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{(members ?? []).map((m) => (
            <tr key={m.user_id}><td>{m.user_id === ctx.user.id ? <strong>Você</strong> : <span className="muted small">Membro {m.user_id.slice(0, 8)}</span>}</td>
              <td><span className="badge">{ROLE_LABEL[m.role as Role]}</span></td><td className="small">{fmtDate(m.created_at.slice(0, 10))}</td>
              <td className="r">{m.role !== "owner" && (admin || m.user_id === ctx.user.id) ? <MemberActions userId={m.user_id} role={m.role} self={m.user_id === ctx.user.id} isOwner={ws.role === "owner"} /> : null}</td></tr>
          ))}</tbody>
        </table></div>
        <details style={{ marginTop: 12 }}><summary className="small" style={{ fontWeight: 600, cursor: "pointer" }}>O que cada papel pode fazer</summary>
          <ul className="small" style={{ paddingLeft: 18 }}>
            <li><strong>Proprietário:</strong> controle do espaço, membros e configurações; cobrança apenas se também for o titular da assinatura.</li>
            <li><strong>Administrador:</strong> gestão financeira e de membros (não pode tomar a propriedade nem alterar a cobrança).</li>
            <li><strong>Colaborador:</strong> cria, edita e estorna registros (estornos ficam auditados) e executa tarefas; não administra membros nem assinatura.</li>
            <li><strong>Leitor:</strong> consulta e exporta, sem alterar registros.</li>
          </ul>
        </details>
      </section>
      {admin ? (
        <>
          <section className="card" aria-labelledby="c"><div className="card-header"><h2 id="c">Convidar</h2></div><InviteForm canInviteAdmin={ws.role === "owner"} /></section>
          <section className="card" aria-labelledby="i"><div className="card-header"><h2 id="i">Convites</h2></div>
            {(invites ?? []).length === 0 ? <p className="muted">Nenhum convite.</p> : (
              <div className="table-wrap"><table className="table"><thead><tr><th>E-mail</th><th>Papel</th><th>Situação</th><th><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>{(invites ?? []).map((i) => {
                  const status = i.accepted_at ? "Aceito" : i.revoked_at ? "Revogado" : i.expires_at < now ? "Expirado" : `Pendente até ${fmtDate(i.expires_at.slice(0, 10))}`;
                  return <tr key={i.id}><td>{i.email}</td><td>{ROLE_LABEL[i.role as Role]}</td><td className="small">{status}</td><td className="r">{status.startsWith("Pendente") ? <RevokeInvite id={i.id} /> : null}</td></tr>;
                })}</tbody></table></div>
            )}
          </section>
          <section className="card" aria-labelledby="a"><div className="card-header"><h2 id="a">Auditoria</h2></div>
            {(audit ?? []).length === 0 ? <p className="muted">Sem eventos.</p> : (
              <ul className="small" style={{ listStyle: "none", padding: 0, margin: 0 }}>{(audit ?? []).map((a, i) => <li key={i} style={{ padding: "6px 0", borderBottom: "1px solid var(--rumo-border)" }}>{new Date(a.created_at).toLocaleString("pt-BR")} · <strong>{a.action}</strong> {a.entity}{a.actor_id === ctx.user.id ? " · por você" : ""}</li>)}</ul>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
