/** Mapeia erros do domínio (mensagens das funções SQL) para textos claros em português. */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Sua sessão expirou. Entre novamente para continuar.",
  forbidden: "Você não tem permissão para esta ação neste espaço.",
  workspace_read_only: "Este espaço está somente leitura (excede a franquia do plano atual). Você ainda pode consultar e exportar.",
  version_conflict: "Este registro foi alterado em outra tela. Recarregue para ver a versão atual.",
  invalid_amount: "Informe um valor maior que zero.",
  exceeds_pending: "O valor é maior que o saldo pendente.",
  exceeds_outstanding: "O valor é maior que o saldo devedor.",
  date_and_amount_required: "Informe data e valor do pagamento.",
  account_not_found: "Conta não encontrada neste espaço.",
  category_invalid: "Categoria inválida para este tipo de lançamento.",
  card_not_found: "Cartão não encontrado.",
  not_found: "Registro não encontrado.",
  "quota_exceeded:entries": "Você atingiu o limite de lançamentos novos do mês no seu plano. Os registros existentes continuam disponíveis.",
  "quota_exceeded:workspaces": "Seu plano não permite mais espaços ativos.",
  "quota_exceeded:goals": "Seu plano não permite mais metas ativas.",
  "quota_exceeded:guests": "Seu plano não permite mais convidados.",
  "quota_exceeded:ai_credits": "Créditos de IA do mês esgotados. O controle financeiro continua funcionando normalmente.",
  "quota_exceeded:tts_seconds": "Minutos de voz do mês esgotados.",
  "quota_exceeded:stt_seconds": "Minutos de transcrição do mês esgotados.",
  invitation_invalid: "Convite inválido, expirado ou revogado.",
  invitation_wrong_recipient: "Este convite foi enviado para outro e-mail. Entre com o e-mail convidado (e confirmado).",
  already_member: "Esta pessoa já participa do espaço.",
  intent_hash_mismatch: "A proposta mudou desde que foi exibida. Revise novamente antes de confirmar.",
  intent_not_found: "Proposta não encontrada.",
  cannot_remove_owner: "O proprietário não pode ser removido.",
  owner_cannot_leave: "O proprietário não pode sair do próprio espaço.",
};

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; code: string };

export function domainError(err: unknown): { code: string; message: string } {
  const raw = typeof err === "object" && err && "message" in err ? String((err as { message: unknown }).message) : String(err);
  const code = Object.keys(MESSAGES).find((k) => raw === k || raw.startsWith(k + " ") || raw.includes(k)) ?? "unknown";
  if (raw.startsWith("not_configured:")) return { code: raw, message: "Este recurso ainda não está configurado neste ambiente." };
  if (raw.startsWith("intent_not_executable")) return { code: "intent_not_executable", message: "Esta proposta já foi recusada, expirou ou falhou." };
  return { code, message: MESSAGES[code] ?? "Não foi possível concluir. Tente novamente." };
}

export function fail(err: unknown): ActionResult<never> {
  const { code, message } = domainError(err);
  return { ok: false, error: message, code };
}
