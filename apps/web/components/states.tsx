import Link from "next/link";
import type { ReactNode } from "react";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: { href: string; label: string } }) {
  return (
    <div className="empty">
      <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden><path d="M32 6 L50 56 L32 45 Z" fill="#DCE5F3" /><path d="M32 6 L14 56 L32 45 Z" fill="#E8EEFF" /></svg>
      <h3>{title}</h3>
      {children ? <p style={{ maxWidth: "52ch" }}>{children}</p> : null}
      {action ? <Link className="btn btn-primary" href={action.href}>{action.label}</Link> : null}
    </div>
  );
}

export function NotConfigured({ what }: { what: string }) {
  return (
    <div className="alert alert-warn" role="status">
      <div><strong>{what} ainda não está configurado neste ambiente.</strong> As demais funções continuam disponíveis. Consulte docs/implantacao.md.</div>
    </div>
  );
}
