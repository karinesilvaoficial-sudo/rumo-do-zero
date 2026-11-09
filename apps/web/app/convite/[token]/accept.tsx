"use client";
import { useState } from "react";
import { Alert } from "@/components/ui";
import { acceptInvite } from "@/app/app/pessoas/actions";

export function Accept({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="stack">
      {err ? <Alert tone="error">{err}</Alert> : null}
      <button className="btn btn-primary" disabled={busy} aria-busy={busy} onClick={async () => {
        setBusy(true); setErr(null);
        const r = await acceptInvite(token);
        if (r.ok) window.location.replace(new URL("/app", window.location.origin)); else { setErr(r.error); setBusy(false); }
      }}>{busy ? "Aceitando…" : "Aceitar convite"}</button>
    </div>
  );
}
