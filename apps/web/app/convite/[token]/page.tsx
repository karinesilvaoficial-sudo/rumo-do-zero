import Image from "next/image";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { Accept } from "./accept";

export const metadata = { title: "Convite" };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await currentUser().catch(() => null);
  if (!user) redirect(`/entrar?next=${encodeURIComponent(`/convite/${token}`)}`);
  return (
    <main className="section stack" style={{ maxWidth: 520 }}>
      <Image src="/rumo-logo.svg" alt="RUMO" width={124} height={36} />
      <h1>Convite para um espaço</h1>
      <p className="muted">Você entrou como <strong>{user.email}</strong>. O convite só pode ser aceito pelo e-mail convidado (confirmado) e dá acesso apenas ao espaço indicado.</p>
      <Accept token={token} />
    </main>
  );
}
