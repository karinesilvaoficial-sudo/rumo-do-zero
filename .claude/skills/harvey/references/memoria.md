# Memória

O Harvey lembra das sessões anteriores por arquivos dentro do projeto. Não depende de serviço externo.

## Onde fica

```
.claude/memory/
  harvey.md          lições curadas: decisões, preferências, o que funcionou, o que evitar
  INDICE.md          uma linha por sessão gravada
  sessoes/
    AAAA-MM-DD_<id>.md   a conversa da sessão: o que o usuário pediu e o que foi respondido
```

## Como funciona sozinho

`.claude/settings.json` liga três hooks:

| Momento | O que roda | Efeito |
|---|---|---|
| Início da sessão | `memoria.py contexto` | Injeta as lições, as oito sessões mais recentes e o fim da última conversa |
| Antes de compactar o contexto | `memoria.py salvar` | Grava a conversa antes que o histórico seja resumido |
| Fim da sessão | `memoria.py salvar` | Grava a versão final da conversa |

O registro guarda as mensagens do usuário (até 6.000 caracteres cada) e a resposta final de cada
turno (até 2.500). Saídas de ferramentas ficam de fora. Antes de gravar, o script troca por
marcadores o que parece chave de API, senha, e-mail, CPF e número de cartão.

## Comandos

```bash
python3 .claude/skills/harvey/scripts/memoria.py contexto
python3 .claude/skills/harvey/scripts/memoria.py buscar contrato fornecedor
python3 .claude/skills/harvey/scripts/memoria.py listar
python3 .claude/skills/harvey/scripts/memoria.py anotar "Cliente prefere propostas de uma página" --tipo preferencia
python3 .claude/skills/harvey/scripts/memoria.py salvar
```

`buscar` exige que todos os termos estejam na mesma linha. Use um ou dois termos e radicais
("juridic" acha jurídico e jurídica). Para ler uma sessão inteira, abra o arquivo em `sessoes/`.

## Limites reais

- **Sessão na nuvem:** o contêiner é descartado. O que não foi para o git se perde. Na fase 9, faça
  commit de `.claude/memory/` e envie. Uma sessão nova só enxerga a memória da branch em que
  começa, então a memória precisa chegar à branch principal (por merge) para valer em todo lugar.
- **Privacidade:** as conversas ficam no repositório. Em repositório público ou compartilhado,
  avise o usuário e ofereça manter só `harvey.md` (adicionando `.claude/memory/sessoes/` ao `.gitignore`).
- **Tamanho do contexto:** o início da sessão carrega um resumo, não tudo. O resto é consultado por busca.
- **Plugin claude-mem:** se estiver instalado (ferramentas de busca, linha do tempo e observações),
  use os dois. Ele faz busca semântica; os arquivos daqui são o registro legível e versionado.

## O que anotar em `harvey.md`

Só o que muda o comportamento futuro: decisão tomada e o motivo, preferência do usuário, comando
que funciona neste projeto, erro que custou tempo, fato do negócio (CNPJ nunca; ramo, produtos,
público e tom, sim). Uma linha por item. Nada que o código ou o git já contam.
