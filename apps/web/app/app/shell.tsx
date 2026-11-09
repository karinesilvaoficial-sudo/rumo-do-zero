"use client";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { setPeriod, switchWorkspace, toggleHideValues } from "./actions";

const SceneLayer = dynamic(() => import("@/components/three/scene-layer").then((m) => m.SceneLayer), { ssr: false });

type WS = { id: string; name: string; kind: "personal" | "business"; role: string; readOnly: boolean };
const NAV = [
  { href: "/app", label: "Visão geral", icon: Icon.overview },
  { href: "/app/lancamentos", label: "Lançamentos", icon: Icon.entries },
  { href: "/app/planejamento", label: "Planejamento", icon: Icon.planning },
  { href: "/app/metas", label: "Metas", icon: Icon.goals },
  { href: "/app/dividas", label: "Dívidas e cartões", icon: Icon.cards },
  { href: "/app/rendas", label: "Novas rendas", icon: Icon.income },
  { href: "/app/ia", label: "RUMO IA", icon: Icon.ai },
  { href: "/app/relatorios", label: "Relatórios", icon: Icon.reports },
];
const ACCOUNT = [
  { href: "/app/pessoas", label: "Pessoas e permissões", icon: Icon.people },
  { href: "/app/assinatura", label: "Assinatura", icon: Icon.billing },
  { href: "/app/notificacoes", label: "Notificações", icon: Icon.info },
  { href: "/app/configuracoes", label: "Configurações", icon: Icon.settings },
];
const PERIODS = [["mes", "Este mês"], ["mes-anterior", "Mês anterior"], ["3m", "3 meses"], ["12m", "12 meses"], ["ano", "Ano"]] as const;

function isActive(path: string, href: string) {
  return href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/");
}

export function Shell({ children, user, workspaces, activeId, hideValues, reduceMotion, period }: {
  children: ReactNode; user: { email: string | null; name: string | null; isAdmin: boolean }; workspaces: WS[]; activeId: string | null;
  hideValues: boolean; reduceMotion: boolean; period: { key: string; label: string };
}) {
  const path = usePathname();
  const router = useRouter();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === path; // muda de rota → menu fecha
  const setOpen = (v: boolean) => setOpenAt(v ? path : null);
  const [hide, setHide] = useState(hideValues);
  const [pending, start] = useTransition();
  const active = workspaces.find((w) => w.id === activeId) ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenAt(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav = (
    <>
      <div className="brand"><Link href="/app" aria-label="RUMO — visão geral"><Image src="/rumo-logo.svg" alt="RUMO" width={112} height={32} priority /></Link></div>
      <nav className="nav" aria-label="Módulos">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? "page" : undefined}><n.icon />{n.label}</Link>
        ))}
        <div className="nav-section">Conta</div>
        {ACCOUNT.map((n) => (
          <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? "page" : undefined}><n.icon />{n.label}</Link>
        ))}
        {user.isAdmin ? <Link href="/app/admin" aria-current={isActive(path, "/app/admin") ? "page" : undefined}><Icon.admin />Administração</Link> : null}
      </nav>
      <div style={{ marginTop: "auto", padding: "16px 12px 0", borderTop: "1px solid var(--rumo-border)" }}>
        <p className="small" style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{user.name ?? "Sua conta"}</p>
        <p className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</p>
        <form action="/auth/sair" method="post" style={{ marginTop: 8 }}>
          <button className="btn btn-ghost btn-sm" type="submit"><Icon.logout width={18} height={18} />Sair</button>
        </form>
      </div>
    </>
  );

  return (
    <div className="shell" data-hide-values={hide}>
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <aside className="sidebar" data-open={open} id="menu-lateral" aria-label="Menu">{nav}</aside>
      {open ? <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, background: "rgb(11 31 77 / 30%)", zIndex: 2 }} aria-hidden /> : null}
      <div className="main">
        <header className="topbar">
          <button className="btn btn-ghost icon-btn hide-desktop" aria-label="Abrir menu" aria-expanded={open} aria-controls="menu-lateral" onClick={() => setOpen(true)}><Icon.menu /></button>
          {workspaces.length > 0 ? (
            <label className="row" style={{ gap: 8 }}>
              <span className="sr-only">Espaço ativo</span>
              <span className={`badge ${active?.kind === "business" ? "badge-warn" : ""}`} aria-hidden>{active?.kind === "business" ? "Negócio" : "Pessoal"}</span>
              <select className="select ws-switch" value={activeId ?? ""} disabled={pending} onChange={(e) => {
                const id = e.target.value;
                start(async () => { await switchWorkspace(id); router.refresh(); });
              }}>
                {workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}{w.readOnly ? " (somente leitura)" : ""}</option>)}
              </select>
            </label>
          ) : null}
          <label className="hide-mobile">
            <span className="sr-only">Período</span>
            <select className="select" value={period.key} disabled={pending} onChange={(e) => {
              const k = e.target.value;
              start(async () => { await setPeriod(k); router.refresh(); });
            }}>
              {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              {period.key === "custom" ? <option value="custom">{period.label}</option> : null}
            </select>
          </label>
          <div className="spacer" />
          <form action="/app/lancamentos" className="hide-mobile" role="search">
            <label className="sr-only" htmlFor="busca">Buscar lançamentos</label>
            <input id="busca" name="q" className="input" placeholder="Buscar lançamentos" style={{ width: 220 }} />
          </form>
          <button className="btn btn-ghost icon-btn" aria-pressed={hide} aria-label={hide ? "Mostrar valores" : "Ocultar valores"} title={hide ? "Mostrar valores" : "Ocultar valores"}
            onClick={() => { const v = !hide; setHide(v); void toggleHideValues(v); }}>
            {hide ? <Icon.eyeOff /> : <Icon.eye />}
          </button>
          <Link className="btn btn-primary btn-sm hide-mobile" href="/app/lancamentos?novo=1"><Icon.plus width={18} height={18} />Novo lançamento</Link>
        </header>
        {pending ? <div role="status" className="sr-only">Atualizando…</div> : null}
        <main id="conteudo" className="content" data-scene-content tabIndex={-1}>
          {active?.readOnly ? <div className="alert alert-warn" role="status">Este espaço está somente leitura porque excede a franquia do plano atual. Você pode consultar e exportar os dados.</div> : null}
          {children}
        </main>
      </div>
      <SceneLayer reduceMotionPref={reduceMotion} />
      <Link className="btn btn-primary fab" href="/app/lancamentos?novo=1" aria-label="Novo lançamento"><Icon.plus />Novo</Link>
      <nav className="bottom-nav" aria-label="Atalhos">
        <Link href="/app" aria-current={path === "/app" ? "page" : undefined}><Icon.overview />Início</Link>
        <Link href="/app/lancamentos" aria-current={isActive(path, "/app/lancamentos") ? "page" : undefined}><Icon.entries />Lançamentos</Link>
        <Link href="/app/metas" aria-current={isActive(path, "/app/metas") ? "page" : undefined}><Icon.goals />Metas</Link>
        <Link href="/app/ia" aria-current={isActive(path, "/app/ia") ? "page" : undefined}><Icon.ai />RUMO IA</Link>
        <button onClick={() => setOpen(true)} aria-expanded={open} aria-controls="menu-lateral"><Icon.menu />Menu</button>
      </nav>
    </div>
  );
}
