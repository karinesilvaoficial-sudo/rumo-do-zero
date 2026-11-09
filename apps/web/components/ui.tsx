"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Icon } from "./icons";

export function SubmitButton({ children, className = "btn btn-primary", pendingLabel = "Salvando…", disabled }: { children: ReactNode; className?: string; pendingLabel?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending ? (<><span className="spinner" aria-hidden />{pendingLabel}</>) : children}
    </button>
  );
}

export function Alert({ tone = "info", children, role }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode; role?: "alert" | "status" }) {
  const I = tone === "error" || tone === "warn" ? Icon.alert : tone === "ok" ? Icon.check : Icon.info;
  return (
    <div className={`alert alert-${tone}`} role={role ?? (tone === "error" ? "alert" : "status")}>
      <I width={18} height={18} style={{ flex: "none", marginTop: 2 }} />
      <div>{children}</div>
    </div>
  );
}

/** Diálogo nativo acessível (foco preso, Esc fecha). Controlado por `open`. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" onClose={onClose} aria-labelledby="sheet-title" onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="sheet-head">
        <h2 id="sheet-title" style={{ fontSize: "1.05rem" }}>{title}</h2>
        <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Fechar"><Icon.close width={20} height={20} /></button>
      </div>
      <div className="sheet-body">{open ? children : null}</div>
    </dialog>
  );
}
