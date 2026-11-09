# Política financeira

- **Realizado** = `transactions`; **previsto** = `commitments` em aberto; **simulado** = projeções/cenários (nunca gravados como fato).
- **Saldo** = saldo inicial das contas + ledger até a data. Saldo inicial não é receita.
- **Transferência** entre contas próprias: um fato, dois lançamentos de ledger (−/+). Não é receita nem despesa.
- **Cartão**: a compra é despesa por competência na data da compra (valor total); parcelas distribuem o compromisso entre faturas (piso + resíduo na última: R$ 100,00/3 = 33,33 · 33,33 · 33,34). Compra no dia do fechamento ou depois → próxima fatura. Pagar a fatura é saída de caixa, **não** nova despesa. Encargos informados (juros, multa, IOF, anuidade) são despesa em "Juros e encargos". Taxa ausente nunca vira zero.
- **Dívida**: amortização do principal é saída de caixa, não despesa; juros são despesa separada.
- **Compromissos**: pagamento exige data e valor; parcial mantém pendente; cancelar cancela só o pendente.
- **Excluir = estornar**: transação espelho com ledger invertido; original marcado; histórico preservado; indicadores recalculados. Editar valor/conta/data reescreve o ledger na mesma transação com verificação de versão.
- **Recorrências**: ocorrências calculadas a partir da data inicial (31/jan → 28/fev → 31/mar), únicas por `(regra, data)`. "Editar só esta" destaca a ocorrência; "editar próximas" altera regra e futuras não pagas/não destacadas.
- **Negócio**: margem de contribuição = receita − custos variáveis; markup = (preço − custo)/custo; margem sobre preço = (preço − custo)/preço; ponto de equilíbrio = fixos ÷ índice de MC. Divisão por zero → indisponível. Retirada de sócio não é venda. Relatório gerencial, não contábil.
- **Datas**: instantes em UTC; datas de negócio em `date`; exibição em `America/Sao_Paulo` (configurável por espaço/perfil).
