import Image from "next/image";
import Link from "next/link";
import { StaticCompass } from "@/components/three/static-compass";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-wrap">
      <section className="auth-panel">
        <Link href="/" aria-label="RUMO — início" style={{ marginBottom: 40 }}><Image src="/rumo-logo.svg" alt="RUMO" width={124} height={36} priority /></Link>
        {children}
      </section>
      <aside className="auth-art" aria-hidden>
        <div style={{ position: "absolute", inset: "18%" }}><StaticCompass label="" /></div>
        <p style={{ position: "absolute", left: 40, bottom: 40, right: 40, color: "var(--rumo-deep)", fontWeight: 700, fontSize: "1.25rem", maxWidth: "26ch" }}>Clareza para decidir o próximo passo.</p>
      </aside>
    </main>
  );
}
