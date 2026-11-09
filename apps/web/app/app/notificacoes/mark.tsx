"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markNotificationsRead } from "../configuracoes/actions";

export function MarkRead() {
  const router = useRouter();
  const [p, start] = useTransition();
  return <button className="btn btn-secondary" disabled={p} onClick={() => start(async () => { await markNotificationsRead(); router.refresh(); })}>Marcar todas como lidas</button>;
}
