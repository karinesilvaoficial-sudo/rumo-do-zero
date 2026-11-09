"use server";
import { randomBytes } from "node:crypto";
import { hashToken } from "@/lib/tokens";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { env } from "@/lib/env";
import { type ActionResult, fail } from "@/lib/errors";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { integrationStatus } from "@/lib/env";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { getCtx, WS_COOKIE } from "@/lib/workspace";

/** Convite: token aleatório de 256 bits; só o hash fica no banco. E-mail via fila (outbox). */
export async function invite(_: unknown, fd: FormData): Promise<ActionResult<{ queued: boolean }>> {
  const p = z.object({ email: z.email().max(200), role: z.enum(["admin", "collaborator", "reader"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { ok: false, code: "invalid_input", error: "Informe um e-mail válido e o papel." };
  try {
    const ctx = await getCtx();
    if (!ctx?.active) throw new Error("not_authenticated");
    const token = randomBytes(32).toString("base64url");
    const sb = await supabaseServer();
    const { data: id, error } = await sb.rpc("create_invitation", { ws: ctx.active.id, p_email: p.data.email, p_role: p.data.role, p_token_hash: hashToken(token) });
    if (error) throw error;
    let queued = false;
    if (integrationStatus().admin_db) {
      await supabaseAdmin().from("outbox").insert({ kind: "email", dedupe_key: `email:invite:${id}`, payload: {
        to: p.data.email, template: "invitation", token, title: `Convite para o espaço ${ctx.active.name}`,
        body: `${ctx.profile.full_name ?? ctx.user.email} convidou você para participar do espaço “${ctx.active.name}” no RUMO. O convite vale por 7 dias e dá acesso apenas a este espaço.` } });
      queued = true;
    }
    revalidatePath("/app/pessoas");
    return { ok: true, data: { queued } };
  } catch (e) { return fail(e); }
}

export async function revokeInvite(id: string): Promise<ActionResult<null>> {
  try {
    const ctx = await getCtx();
    if (!ctx?.active) throw new Error("not_authenticated");
    const sb = await supabaseServer();
    const { error } = await sb.rpc("revoke_invitation", { ws: ctx.active.id, p_invitation_id: z.uuid().parse(id) });
    if (error) throw error;
    revalidatePath("/app/pessoas");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export async function removeMember(userId: string): Promise<ActionResult<null>> {
  try {
    const ctx = await getCtx();
    if (!ctx?.active) throw new Error("not_authenticated");
    const sb = await supabaseServer();
    const { error } = await sb.rpc("remove_member", { ws: ctx.active.id, p_user_id: z.uuid().parse(userId) });
    if (error) throw error;
    revalidatePath("/app/pessoas");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export async function changeRole(userId: string, role: string): Promise<ActionResult<null>> {
  try {
    const ctx = await getCtx();
    if (!ctx?.active) throw new Error("not_authenticated");
    const sb = await supabaseServer();
    const { error } = await sb.rpc("change_member_role", { ws: ctx.active.id, p_user_id: z.uuid().parse(userId), p_role: z.enum(["admin", "collaborator", "reader"]).parse(role) });
    if (error) throw error;
    revalidatePath("/app/pessoas");
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export async function acceptInvite(token: string): Promise<ActionResult<string>> {
  try {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw new Error("invitation_invalid");
    if (!(await currentUser())) throw new Error("not_authenticated");
    const sb = await supabaseServer();
    const { data, error } = await sb.rpc("accept_invitation", { p_token_hash: hashToken(token) });
    if (error) throw error;
    (await cookies()).set(WS_COOKIE, data as string, { httpOnly: true, sameSite: "lax", path: "/", secure: env().APP_ENV === "production" });
    return { ok: true, data: data as string };
  } catch (e) { return fail(e); }
}
