/** Roteiros gerais (sem dados pessoais) — gerados uma vez por versão/voz/modelo e reutilizados. */
export const SCRIPT_VERSION = "2026-11-09.1";

export const SCREEN_SCRIPTS: Record<string, string> = {
  overview: "Esta é a visão geral do espaço ativo. No topo estão o saldo calculado a partir dos seus registros, as entradas e as saídas do período e o resultado. Toque em qualquer indicador para ver a fórmula, o período e os registros de origem. Abaixo, a próxima ação recomendada, os compromissos dos próximos quinze dias e a meta prioritária. Para registrar algo, use Novo lançamento. Para tirar dúvidas, use Perguntar ao RUMO.",
  entries: "Aqui ficam os lançamentos do espaço. Use os filtros para escolher período, tipo, conta e categoria; cada filtro ativo aparece como uma etiqueta que você pode remover. Para corrigir um registro, abra-o e edite. Para desfazer, use o estorno: o histórico é preservado e os indicadores são recalculados.",
  planning: "No planejamento você define orçamentos por categoria, acompanha contas a pagar e a receber e cria recorrências. As projeções mostram cenários conservador, central e otimista: são hipóteses editáveis, não promessas.",
  goals: "Em metas, cada objetivo tem valor, prazo e contribuições. O progresso considera apenas as contribuições registradas, e o cálculo mostra quanto é preciso guardar por mês para chegar no prazo.",
  debts: "Em dívidas e cartões você registra cartões, compras parceladas, faturas e dívidas. A compra no cartão é a despesa; o pagamento da fatura apenas quita o compromisso. Juros só entram quando informados: se a taxa for desconhecida, a simulação fica incompleta até você informá-la.",
  income: "Em novas rendas você faz um diagnóstico com suas habilidades, horas e recursos, recebe caminhos compatíveis com premissas claras e transforma o escolhido em um plano de sete e de trinta dias, com tarefas, materiais e um indicador para decidir continuar, ajustar ou abandonar.",
  ai: "Esta é a RUMO I A. Pergunte sobre seus números ou peça ajuda para planejar. As respostas indicam o espaço e o período consultados. Quando a I A propõe uma alteração, nada é gravado até você confirmar.",
  reports: "Em relatórios você compara períodos, analisa categorias, fluxo e dias de maior gasto, e exporta em PDF, planilha ou C S V. Todos usam os mesmos valores do painel.",
};
