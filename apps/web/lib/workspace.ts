import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { currentUser, supabaseServer } from "@/lib/supabase/server";

export type Role = "owner" | "admin" | "collaborator" | "reader";
export type WorkspaceRow = { id: string; name: string; kind: "personal" | "business"; timezone: string; read_only: boolean; owner_id: string };
export type Ctx = {
  user: { id: string; email: string | null };
  workspaces: (WorkspaceRow & { role: Role })[];
  active: (WorkspaceRow & { role: Role }) | null;
  profile: { full_name: string | null; hide_values: boolean; reduce_motion: boolean; is_platform_admin: boolean; onboarding_state: Record<string, unknown> };
};

export const WS_COOKIE = "rumo_ws";

/**
 * Contexto da requisição. O espaço ativo vem do cookie, mas só é aceito se o usuário for membro
 * (a consulta passa por RLS — o banco só devolve espaços dos quais ele participa).
 */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const user = await currentUser();
  if (!user) return null;
  const sb = await supabaseServer();
  const [{ data: ws }, { data: mem }, { data: prof }] = await Promise.all([
    sb.from("workspaces").select("id,name,kind,timezone,read_only,owner_id").is("archived_at", null).order("created_at"),
    sb.from("memberships").select("workspace_id,role").eq("user_id", user.id),
    sb.from("profiles").select("full_name,hide_values,reduce_motion,is_platform_admin,onboarding_state").eq("id", user.id).maybeSingle(),
  ]);
  const roles = new Map((mem ?? []).map((m) => [m.workspace_id as string, m.role as Role]));
  const workspaces = ((ws ?? []) as WorkspaceRow[]).filter((w) => roles.has(w.id)).map((w) => ({ ...w, role: roles.get(w.id)! }));
  const wanted = (await cookies()).get(WS_COOKIE)?.value;
  const active = workspaces.find((w) => w.id === wanted) ?? workspaces[0] ?? null;
  return {
    user,
    workspaces,
    active,
    profile: {
      full_name: prof?.full_name ?? null,
      hide_values: Boolean(prof?.hide_values),
      reduce_motion: Boolean(prof?.reduce_motion),
      is_platform_admin: Boolean(prof?.is_platform_admin),
      onboarding_state: (prof?.onboarding_state as Record<string, unknown>) ?? {},
    },
  };
});

export const ROLE_LABEL: Record<Role, string> = { owner: "Proprietário", admin: "Administrador", collaborator: "Colaborador", reader: "Leitor" };
export const canWrite = (r: Role) => r !== "reader";
export const canAdmin = (r: Role) => r === "owner" || r === "admin";
