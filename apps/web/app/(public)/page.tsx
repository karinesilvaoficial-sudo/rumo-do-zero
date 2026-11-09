import { formatBRL, formatBytes, formatLimit, PLANS } from "@rumo/contracts";
import Link from "next/link";
import { HeroStage } from "./hero-stage";

const FEATURES = [
  { t: "Painel executivo", d: "Saldo calculado a partir dos seus registros, entradas e saídas do período, vencimentos e a próxima ação — com a origem de cada número a um toque." },
  { t: "Planejamento confiável", d: "Orçamentos, recorrências, cartões, parcelas e dívidas com cálculos exatos ao centavo. Hipóteses identificadas; nada é inventado." },
  { t: "Novas fontes de renda", d: "Diagnóstico do seu perfil, caminhos compatíveis, plano de 7 e 30 dias, propostas e acompanhamento comercial." },
  { t: "RUMO IA", d: "Explica seus números em português claro e prepara ações — que só acontecem depois da sua confirmação." },
  { t: "Voz", d: "“Explique esta tela”, ouvir respostas e falar com o RUMO pelo microfone, com voz masculina executiva em português." },
  { t: "Compartilhamento", d: "Convide família, sócios ou equipe com papéis definidos. O espaço do negócio não revela sua vida pessoal." },
];

const CASES = [
  { t: "Pessoa física", d: "Organize contas, cartão e metas; saiba quanto falta para fechar o mês e qual compromisso vence primeiro." },
  { t: "Negócio local", d: "Caixa, contas a pagar e a receber, margem de contribuição e ponto de equilíbrio quando os dados permitirem." },
  { t: "Renda extra", d: "Transforme habilidades e horas disponíveis em uma oferta, um primeiro teste de validação e metas de acompanhamento." },
];

const FAQ = [
  { q: "O RUMO se conecta à minha conta bancária?", a: "Não. Não usamos Open Finance, não conectamos contas e não pedimos senhas bancárias. Você registra os dados por digitação ou por comandos de texto e voz que revisa antes de salvar." },
  { q: "A IA pode mexer no meu dinheiro?", a: "Não. A RUMO IA explica e prepara alterações internas (como criar uma meta). Nada é gravado sem a sua confirmação, e ela nunca movimenta dinheiro, contrata crédito ou envia mensagens a terceiros." },
  { q: "O plano Free expira?", a: "Não. O Free é contínuo, sem cartão obrigatório. Você pode exportar seus registros em CSV a qualquer momento, inclusive depois de mudar de plano." },
  { q: "O que significa “Ilimitado”?", a: "Lançamentos, metas e espaços sem teto comercial fixo. Créditos de IA, minutos de voz, convidados e armazenamento seguem os limites da tabela." },
  { q: "Como funciona o pagamento por Pix?", a: "Quando a renovação automática por Pix não estiver disponível, o Pix funciona como pagamento antecipado do período escolhido, com renovação manual. No cartão, a renovação é automática." },
  { q: "As sugestões de renda são garantidas?", a: "Não. São caminhos compatíveis com os dados que você informou, com premissas e estimativas identificadas. Não sugerimos apostas, pirâmides nem renda garantida." },
];

export default function Landing() {
  return (
    <>
      <section className="section hero" aria-labelledby="hero-title">
        <div>
          <p className="eyebrow">Finanças · Planejamento · Novas rendas</p>
          <h1 id="hero-title" style={{ marginTop: 14 }}>Cada número mostra <em>o próximo passo.</em></h1>
          <p className="lead">O RUMO organiza suas finanças pessoais ou do seu negócio, calcula com precisão o que vem pela frente e ajuda você a construir novas fontes de renda — com uma IA que explica e só age com a sua confirmação.</p>
          <div className="row">
            <Link className="btn btn-primary" href="/cadastro">Começar grátis</Link>
            <Link className="btn btn-secondary" href="#como-funciona">Ver como funciona</Link>
          </div>
          <p className="muted small" style={{ marginTop: 16 }}>Sem conexão bancária · Sem cartão no plano Free · Dados isolados por espaço</p>
        </div>
        <HeroStage />
      </section>

      <section className="section" id="como-funciona" aria-labelledby="cf-title">
        <p className="eyebrow">Como funciona</p>
        <h2 id="cf-title" style={{ fontSize: "clamp(1.6rem,3vw,2.4rem)", margin: "10px 0 28px", maxWidth: "26ch" }}>Um painel limpo. Os detalhes aparecem quando você pede.</h2>
        <div className="grid grid-3">
          {FEATURES.map((f) => (
            <article key={f.t} className="card feature">
              <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden><path d="M32 4 L52 58 L32 46 Z" fill="#0B1F4D" /><path d="M32 4 L12 58 L32 46 Z" fill="#1F57FF" /></svg>
              <h3>{f.t}</h3>
              <p className="muted">{f.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="rendas" aria-labelledby="casos-title" style={{ paddingTop: 0 }}>
        <p className="eyebrow">Para quem é</p>
        <h2 id="casos-title" style={{ fontSize: "clamp(1.6rem,3vw,2.4rem)", margin: "10px 0 28px" }}>Pessoas e negócios locais</h2>
        <div className="grid grid-3">
          {CASES.map((c) => (
            <article key={c.t} className="card"><h3>{c.t}</h3><p className="muted" style={{ marginTop: 8 }}>{c.d}</p></article>
          ))}
        </div>
      </section>

      <section className="section" id="planos" aria-labelledby="planos-title" style={{ paddingTop: 0 }}>
        <p className="eyebrow">Planos</p>
        <h2 id="planos-title" style={{ fontSize: "clamp(1.6rem,3vw,2.4rem)", margin: "10px 0 8px" }}>Comece grátis. Evolua quando fizer sentido.</h2>
        <p className="muted" style={{ marginBottom: 24, maxWidth: "70ch" }}>No anual, você paga o equivalente a dez mensalidades, em uma única cobrança.</p>
        <div className="grid grid-kpi" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))" }}>
          {PLANS.map((p) => (
            <article key={p.code} className={`card plan-card ${p.code === "pro" ? "highlight" : ""}`} aria-labelledby={`plan-${p.code}`}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h3 id={`plan-${p.code}`}>{p.name}</h3>
                {p.code === "pro" ? <span className="badge">Mais escolhido</span> : null}
              </div>
              <div>
                <div className="plan-price num">{p.monthly_cents === 0 ? "R$ 0" : formatBRL(BigInt(p.monthly_cents))}<span className="muted small" style={{ fontWeight: 600 }}>/mês</span></div>
                {p.annual_cents > 0 ? (
                  <p className="small"><strong className="num">{formatBRL(BigInt(p.annual_cents))} por ano</strong> <span className="muted">(cobrança única anual)</span></p>
                ) : <p className="small muted">Sem cartão e sem prazo de expiração</p>}
              </div>
              <ul>
                <li>{formatLimit(p.max_workspaces)} {p.max_workspaces === 1 ? "espaço ativo" : p.max_workspaces === null ? "de espaços" : "espaços ativos"}</li>
                <li>{formatLimit(p.max_entries_month)} {p.max_entries_month === null ? "de lançamentos" : "lançamentos novos/mês"}</li>
                <li>{formatLimit(p.max_active_goals)} {p.max_active_goals === null ? "de metas" : "metas ativas"}</li>
                <li>{p.max_guests === 0 ? "Sem convidados" : `${p.max_guests} convidados`}</li>
                <li>{p.ai_credits_month} créditos de IA/mês</li>
                <li>{p.tts_seconds_month / 60} min de voz · {p.stt_seconds_month / 60} min de microfone/mês</li>
                <li>{formatBytes(p.storage_bytes)} de armazenamento</li>
                <li>Análise: {p.analysis}</li>
                <li>Rendas: {p.income}</li>
                <li>PDF: {p.pdf}</li>
              </ul>
              {p.code === "unlimited" ? <p className="small muted">Ilimitado = lançamentos, metas e espaços sem teto comercial fixo. IA, voz, membros e arquivos seguem os limites acima.</p> : null}
              <Link className={`btn ${p.code === "pro" ? "btn-primary" : "btn-secondary"}`} href={p.code === "free" ? "/cadastro" : `/cadastro?plano=${p.code}`} style={{ marginTop: "auto" }}>
                {p.code === "free" ? "Criar conta grátis" : `Assinar ${p.name}`}
              </Link>
            </article>
          ))}
        </div>
        <p className="muted small" style={{ marginTop: 16 }}>Franquias de IA e voz renovam mensalmente, inclusive no plano anual. Não cobramos excedentes automaticamente.</p>
      </section>

      <section className="section faq" id="perguntas" aria-labelledby="faq-title" style={{ paddingTop: 0, maxWidth: 860 }}>
        <p className="eyebrow">Perguntas frequentes</p>
        <h2 id="faq-title" style={{ fontSize: "clamp(1.6rem,3vw,2.4rem)", margin: "10px 0 16px" }}>Transparência em primeiro lugar</h2>
        {FAQ.map((f) => (
          <details key={f.q}><summary>{f.q}</summary><p className="muted">{f.a}</p></details>
        ))}
        <div className="card" style={{ marginTop: 40, textAlign: "center", background: "var(--rumo-deep)", color: "#fff", border: 0 }}>
          <h2 style={{ fontSize: "1.6rem" }}>Seu próximo passo começa com o primeiro registro.</h2>
          <p style={{ opacity: 0.85, margin: "10px 0 20px" }}>Crie sua conta grátis em menos de um minuto.</p>
          <Link className="btn btn-primary" href="/cadastro">Criar conta grátis</Link>
        </div>
      </section>
    </>
  );
}
