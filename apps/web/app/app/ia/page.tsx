import { redirect } from "next/navigation";
import { ExplainScreen } from "@/components/app/explain-screen";
import { NotConfigured } from "@/components/states";
import { integrationStatus } from "@/lib/env";
import { getPeriod } from "@/lib/period-server";
import { supabaseServer } from "@/lib/supabase/server";
import { canWrite, getCtx } from "@/lib/workspace";
import { Chat, type Intent, type Msg } from "./chat";

export const metadata = { title: "RUMO IA" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await getCtx();
  if (!ctx) redirect("/entrar");
  if (!ctx.active) redirect("/app/onboarding");
  const sp = await searchParams;
  const period = await getPeriod(sp, ctx.active.timezone);
  const sb = await supabaseServer();
  const { data: convs } = await sb.from("conversations").select("id,title,updated_at").eq("workspace_id", ctx.active.id).eq("user_id", ctx.user.id).order("updated_at", { ascending: false }).limit(20);
  const convId = sp.c && convs?.some((c) => c.id === sp.c) ? sp.c : null;
  let messages: Msg[] = [];
  if (convId) {
    const { data } = await sb.from("messages").select("id,role,content,meta,created_at").eq("conversation_id", convId).order("created_at").limit(100);
    messages = (data ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content, meta: m.meta }));
    const { data: ints } = await sb.from("ai_action_intents").select("id,status").eq("conversation_id", convId);
    const st = new Map((ints ?? []).map((i) => [i.id, i.status]));
    messages = messages.map((m) => ({ ...m, meta: { ...m.meta, intents: (m.meta?.intents ?? []).map((i: Intent) => ({ ...i, status: st.get(i.id) ?? "prepared" })) } }));
  }
  const st = integrationStatus();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>RUMO IA</h1>
          <p>Pergunte sobre seus números, peça um plano ou um documento. Espaço: <strong>{ctx.active.name}</strong> · {period.label}. Alterações só acontecem após sua confirmação.</p>
        </div>
        <ExplainScreen screen="ai" workspaceId={ctx.active.id} />
      </div>
      {!st.ai ? <NotConfigured what="A IA (Anthropic)" /> : null}
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr)", gap: 16 }}>
        <nav aria-label="Conversas" className="row" style={{ gap: 8, overflowX: "auto" }}>
          <a className="btn btn-secondary btn-sm" href="/app/ia">+ Nova conversa</a>
          {(convs ?? []).map((c) => <a key={c.id} className={`btn btn-sm ${c.id === convId ? "btn-primary" : "btn-ghost"}`} href={`/app/ia?c=${c.id}`} aria-current={c.id === convId ? "true" : undefined}>{c.title.slice(0, 32)}</a>)}
        </nav>
        <Chat key={`${ctx.active.id}:${convId ?? "new"}`} workspaceId={ctx.active.id} workspaceName={ctx.active.name} conversationId={convId} initial={messages}
          period={{ from: period.from, to: period.to, label: period.label }} canAct={canWrite(ctx.active.role)} aiReady={st.ai} voiceReady={st.voice} />
      </div>
    </>
  );
}
