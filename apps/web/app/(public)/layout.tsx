import Image from "next/image";
import Link from "next/link";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <header className="public-nav">
        <Link href="/" aria-label="RUMO — início"><Image src="/rumo-logo.svg" alt="RUMO" width={124} height={36} priority /></Link>
        <nav aria-label="Principal">
          <Link href="/#como-funciona">Como funciona</Link>
          <Link href="/#rendas">Novas rendas</Link>
          <Link href="/#planos">Planos</Link>
          <Link href="/#perguntas">Perguntas</Link>
          <Link className="btn btn-ghost btn-sm" href="/entrar">Entrar</Link>
          <Link className="btn btn-primary btn-sm" href="/cadastro">Criar conta grátis</Link>
        </nav>
      </header>
      <main id="conteudo">{children}</main>
      <footer className="footer">
        <span>© {new Date().getFullYear()} RUMO. Controle financeiro com dados informados por você — sem conexão bancária.</span>
        <span className="row"><Link href="/privacidade">Privacidade</Link><Link href="/termos">Termos</Link></span>
      </footer>
    </>
  );
}
