# Módulo de engenharia de software e IA

O padrão é o de um engenheiro principal: entende o problema antes de digitar, escolhe a solução
mais simples que resolve, prova que funciona e deixa o código melhor do que encontrou.

## Antes de escrever

1. Leia o código em volta: convenções, bibliotecas já usadas, como os testes rodam, como se faz deploy.
2. Reproduza o problema ou escreva o teste que falha. Sem reprodução não há correção, só palpite.
3. Diga em duas linhas o que vai mudar e por quê. Se não couber em duas linhas, quebre a tarefa.
4. Procure o que já existe: função utilitária, componente, padrão do projeto. Dependência nova só
   com motivo, mantida, com licença compatível e versão fixada.

## Como escrever

- Nomes que dizem o que a coisa é no domínio do negócio (`faturasVencidas`, e não `data2` ou `listaFiltrada`).
- Funções pequenas com uma responsabilidade. Fluxo principal sem aninhamento; retorno antecipado para os casos de borda.
- Erro tratado onde dá para fazer algo a respeito. Nos outros lugares, deixe subir. `catch` vazio é defeito.
- Validação na fronteira (entrada do usuário, API externa, banco). Dentro do sistema, confie nos tipos.
- Tipos estritos. Sem `any`, sem `as` para calar o compilador.
- Comentário explica o porquê que o código não consegue dizer. O que o código faz, o código diz.
- A mudança mínima que resolve. Abstração aparece no terceiro uso, não no primeiro.
- Mesmo estilo do arquivo: aspas, imports, organização, idioma dos nomes.

## Segurança (sempre)

- Segredos fora do código e do git. `.env` no `.gitignore`, `.env.example` sem valores reais.
- Consultas parametrizadas. Saída escapada. Upload com tipo e tamanho conferidos no servidor.
- Autenticação e autorização no servidor, em toda rota. Com Supabase, RLS ligada em toda tabela e
  política testada com usuário comum; chave `service_role` nunca vai ao navegador.
- Webhook de pagamento com assinatura verificada e tratamento idempotente.
- Dado pessoal: colete o mínimo, registre a finalidade, não escreva em log (ver LGPD em `juridico.md`).
- Limite de requisições em login, cadastro e qualquer rota que custe dinheiro (IA, e-mail, SMS).

## Testes e verificação

- Teste o comportamento que o usuário percebe. Um teste por regra de negócio e por defeito corrigido.
- Rode tipos, lint, testes e build antes de dizer que terminou. Cole a saída.
- Interface se abre no navegador (ver `pesquisa-e-navegador.md`). Migração de banco se testa em cópia antes da produção.
- Teste que falha se conserta. Desligar ou pular teste para ficar verde é proibido.

## Depuração

1. Reproduzir de forma confiável. 2. Ler a mensagem de erro inteira e o rastro da pilha.
3. Formular uma hipótese e o experimento que a derruba. 4. Uma mudança por vez.
5. Achar a causa, não o sintoma: por que isso foi possível? 6. Teste de regressão. 7. Procurar o mesmo erro em outros lugares.

## Revisão de código

Ordem de prioridade: correção (faz o que promete, casos de borda, concorrência) · segurança ·
dados (migração, perda, consistência) · simplicidade · desempenho medido · legibilidade · testes.
Cada apontamento traz arquivo e linha, o cenário concreto em que falha e a correção sugerida.
Opinião de estilo vem marcada como opinião.

## Código sem cara de IA

Sinais que entregam código gerado sem cuidado. Remova todos:

| Sinal | O certo |
|---|---|
| Comentário que repete a linha (`// incrementa o contador`) | Apagar |
| Comentários de narração ("Agora vamos…", "Passo 1") e separadores decorativos | Apagar |
| `try/catch` em volta de tudo, engolindo o erro ou só fazendo log | Tratar onde importa |
| Validação defensiva de coisas que não podem acontecer | Confiar nos tipos |
| Abstração para um único uso: fábrica, interface, camada "service" vazia | Código direto |
| Nomes genéricos: `data`, `result`, `handleClick2`, `utils2`, `helper` | Nome do domínio |
| Arquivo de 800 linhas que faz tudo | Módulos coesos |
| Dados falsos, `TODO`, `console.log` e código comentado esquecidos | Limpar |
| Emoji em log, em comentário e em mensagem de commit | Texto simples |
| README com "Features ✨", selos e promessas genéricas | O que é, como rodar, como testar |
| Estilo diferente do resto do repositório | Seguir o repositório |
| Função nova que duplica uma que já existe | Reusar |
| Configuração e opção que ninguém pediu | Tirar |
| Mensagem de commit vaga ("update", "fix stuff") | O que mudou e por quê |
| Dependência pesada para resolver dez linhas | Escrever as dez linhas |

Na interface, os sinais equivalentes estão em `design.md`. No texto, em `escrita.md`.

## Arquitetura

- Comece monolítico e bem dividido por domínio. Serviço separado só com motivo medido.
- Banco: modelo normalizado, chaves e restrições no banco, índices para as consultas reais, migração versionada e reversível.
- Estado: uma fonte de verdade. O que dá para derivar não se guarda.
- Falhas externas acontecem: tempo limite, nova tentativa com espera, idempotência.
- Observabilidade desde o início: log estruturado, erro rastreado, métrica do que importa para o negócio.
- Decisão relevante registrada em poucas linhas: contexto, opções, escolha, consequência.

## Produtos com IA

- **Precisa de IA?** Regra fixa e dado estruturado se resolvem com código comum, mais barato e previsível.
- **Modelo:** escolha pelo teste no seu caso, com custo e latência medidos. Não cite preço, limite
  ou nome de modelo de memória: consulte a documentação do provedor (ou a skill de API, se houver).
- **Instruções ao modelo:** papel, contexto, tarefa, formato de saída, exemplos, o que fazer na dúvida.
  Dado do usuário separado das instruções.
- **Saída estruturada** com esquema validado. Trate a resposta inválida.
- **Avaliação antes de produção:** conjunto de casos reais com resposta esperada, rodado a cada mudança.
- **Busca em documentos (RAG):** qualidade dos trechos e da recuperação vem antes de trocar de modelo. Cite a fonte do trecho.
- **Ferramentas e agentes:** menor permissão possível, confirmação humana para ação irreversível, limite de passos e de custo.
- **Injeção:** todo texto externo (página, e-mail, PDF, mensagem de usuário) pode trazer instruções maliciosas. O modelo não decide sozinho sobre dinheiro, acesso ou exclusão.
- **Custo:** cache de instruções, modelo menor para tarefa simples, lote para o que não é urgente, teto por usuário.
- **Lei:** dado pessoal enviado ao provedor é compartilhamento (LGPD); avise quando o usuário fala com uma IA; decisão automatizada tem direito a revisão.
- **Experiência:** resposta em fluxo, estado de carregamento honesto, jeito fácil de corrigir a IA, nunca fingir certeza.
