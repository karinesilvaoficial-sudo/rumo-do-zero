export const metadata = { title: "Política de privacidade" };

/** Modelo a completar com os dados reais do operador (seção 19). Não inventamos CNPJ, endereço ou contato. */
export default function Privacy() {
  return (
    <article className="section stack" style={{ maxWidth: 820 }}>
      <h1>Política de privacidade</h1>
      <div className="alert alert-warn" role="note">Rascunho pendente de revisão jurídica e dos dados do operador: [RAZÃO SOCIAL], [CNPJ], [ENDEREÇO], [E-MAIL DO ENCARREGADO].</div>
      <h2>Dados que tratamos</h2>
      <p>Conta (nome, e-mail), registros financeiros que você digita ou dita, preferências, conversas com a RUMO IA, gravações de voz (retidas por curto período para transcrição) e dados de cobrança processados pelo provedor de pagamentos. Não coletamos credenciais bancárias e não conectamos contas bancárias.</p>
      <h2>Para que usamos</h2>
      <p>Prestar o serviço, calcular indicadores, gerar relatórios e respostas solicitadas, enviar notificações conforme suas preferências, cobrar a assinatura e manter a segurança.</p>
      <h2>Operadores</h2>
      <p>Hospedagem e banco de dados (Vercel, Supabase), IA (Anthropic), voz (ElevenLabs), pagamentos (Stripe) e e-mail (Resend). Enviamos a cada um apenas o necessário para a função solicitada.</p>
      <h2>Seus direitos</h2>
      <p>Você pode exportar seus registros em CSV a qualquer momento e solicitar a exclusão da conta em Configurações. Registros de cobrança podem ser retidos pelo prazo legal aplicável.</p>
    </article>
  );
}
