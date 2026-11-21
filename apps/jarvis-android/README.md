# Jarvis para Android

Assistente de voz que fica escutando em segundo plano e acorda quando você
diz **"Jarvis"** ou bate **2 palmas seguidas**. Depois de acordar, ele ouve um
comando, executa e responde falando.

Com a chave da inteligência, ele deixa de ser só um app de comandos e vira um
**agente pessoal**: você fala e ele resolve, consultando sua agenda, seus contatos
e as mensagens que chegam no celular.

Este app é independente do restante do repositório.

![Estados do painel](docs/previa-painel.png)

O painel é um globo que gira, e cada movimento mostra algo: ele gira mais rápido quando
o Jarvis está pensando, as barras em volta do núcleo acompanham o som do microfone
enquanto ele ouve, e uma onda se abre do centro quando ele é chamado. (A imagem é
uma prévia desenhada com as mesmas medidas do app, não uma captura do celular.)

## O que ele entende

Chame ("Jarvis" ou 2 palmas), espere ele responder ("Sim, mestre?") e diga o comando.

| Você diz | O que acontece |
| --- | --- |
| "Jarvis" … "abrir YouTube" | Abre o app pelo nome (qualquer app instalado) |
| "Jarvis abrir" | Abre a tela do próprio Jarvis |
| "Que horas são?" / "Que dia é hoje?" | Responde falando |
| "Pesquisar receita de bolo" | Pesquisa na internet |
| "Tocar Legião Urbana" | Procura no YouTube |
| "Ligar a lanterna" / "Desligar a lanterna" | Controla a lanterna |
| "Aumentar o volume" / "Silenciar" | Muda o volume de mídia |
| "Timer de 5 minutos" / "Alarme para 7 e meia" | Cria no app Relógio |
| "Como está a bateria?" | Responde a porcentagem |
| Qualquer outra pergunta ou conversa | Responde falando, pela inteligência (Claude) |
| "O que tenho na agenda amanhã?" | Lê os compromissos da agenda do celular |
| "Marca dentista quinta às 15h" | Cria o compromisso, com aviso 30 minutos antes |
| "Chegou alguma mensagem?" | Resume o que chegou no WhatsApp, e-mail e outros apps |
| "Responde a Ana que chego às 8" | Repete o texto, pergunta "posso enviar?" e só envia depois do seu "sim" |
| "Responde o João no Instagram que já vi" | O mesmo, para mensagens do Instagram e de outros apps que aceitam resposta pela notificação |
| "Manda um WhatsApp pro João dizendo…" | Abre a conversa com o texto pronto; você toca em enviar |
| "Escreve um e-mail para…" | Abre o rascunho no app de e-mail; você revisa e envia |
| "Liga para a Maria" | Acha o contato e deixa o número pronto no telefone |
| "Lembra que minha irmã se chama Ana" | Guarda para as próximas conversas |

| "Me lembra de tomar o remédio às 20h" | Marca o lembrete e fala na hora |
| "O que é isso?" | Abre a câmera, você tira a foto e ele descreve |
| "Olha a minha tela" | Pede a autorização do Android, captura a tela e responde sobre ela |
| "Pausa a música" / "Toca Legião Urbana" | Controla o que está tocando ou toca no app de música |
| "Liga o Wi-Fi" | Abre o painel do Wi-Fi para você tocar (o Android não deixa apps mudarem sozinhos) |
| "Quanto vendi hoje?" | Consulta as vendas na Cakto |
| "Abre o YouTube e coloca o primeiro vídeo" | Abre o app, lê a tela e toca por você, em vários passos |
| "Jarvis" (no meio de uma tarefa) | Para o que estiver fazendo |

As linhas a partir de "O que tenho na agenda" precisam da chave da inteligência.

Sem ser chamado, ele também avisa quando a bateria chega a 20% e a 10% e quando termina
de carregar, e volta a escutar sozinho depois que o celular reinicia.
| "Desligar" | Para de escutar |

## Como instalar

1. Baixe o `jarvis.apk` (gerado pelo GitHub Actions, em **Actions > Jarvis Android > último resultado > jarvis-apk**).
2. Abra o arquivo no celular e permita instalar apps dessa origem.
3. Abra o Jarvis, toque em **Ativar o Jarvis** e aceite microfone e notificações.
4. Toque em **Permitir aparecer na tela e abrir apps**. Sem isso, o Android não deixa
   o Jarvis aparecer quando é chamado nem abrir outros apps em segundo plano.
5. Toque em **Não deixar o sistema pausar o Jarvis**, para ele continuar ouvindo com a tela apagada.

## Conversar (responder qualquer pergunta)

O que não é um comando simples vai para o Claude, da Anthropic, que responde
em voz alta, pode buscar na internet e usar as ferramentas do aparelho. Para isso, crie uma chave em
console.anthropic.com e cole no campo **Chave** da tela do Jarvis. O uso é cobrado
na conta da chave; ela fica guardada só no aparelho. Sem chave, perguntas livres
viram uma pesquisa na internet. Depois de responder, o Jarvis volta a esperar o nome
ou as palmas; ele só continua ouvindo quando ele mesmo fez uma pergunta (por exemplo, "Posso enviar?").

## Agente pessoal (agenda, contatos e mensagens)

Depois de salvar a chave, aparecem dois botões na tela do Jarvis:

- **Dar acesso à agenda e aos contatos**: permite ver e criar compromissos e achar
  o telefone de alguém pelo nome.
- **Deixar o Jarvis ler as mensagens que chegam**: abre a tela do Android de "acesso
  a notificações"; ative o Jarvis nela. É por aí que ele lê o WhatsApp e os e-mails,
  sem senha de nenhuma conta. Em Android 13 ou mais novo, como o app foi instalado
  por fora da loja, essa opção pode aparecer bloqueada: vá em Configurações > Apps >
  Jarvis, toque nos três pontinhos e escolha **Permitir configurações restritas**;
  depois volte e ative.

O que saber antes de usar:

- **Ele só vê o que gerou notificação** desde que foi ativado: não lê o histórico
  das conversas, nem mensagens de conversas silenciadas.
- **Nada é enviado sem o seu "sim".** Responder no WhatsApp passa por uma
  confirmação em voz alta que o próprio app faz; a espera vence em dois minutos.
  Iniciar conversa e e-mail só deixam o texto pronto para você enviar.
- **Privacidade**: quando você pede, os compromissos, contatos e mensagens
  consultados são enviados à Anthropic para a inteligência responder. Mensagens
  de outras pessoas entram nisso. Sem pedir, nada disso sai do aparelho.
- **Ligações**: ligar passa pela mesma confirmação em voz alta ("Posso ligar?").
- **Câmera e tela**: ele só olha quando você pede. A foto é você quem tira; a captura de tela
  mostra o aviso do Android a cada vez. A imagem é enviada à Anthropic para a resposta.
- **Conversas anteriores**: as últimas 400 trocas ficam num arquivo no aparelho, para ele
  poder consultar o que foi dito em outros dias.
- **Memória**: o que você manda lembrar fica em um arquivo no aparelho e é apagado
  se você desinstalar o app ou disser "esquece que…".
- O número de WhatsApp sem código de país é tratado como brasileiro (+55).

## Bolha, modo ao vivo e mensagens novas

- **Bolha**: com o celular desbloqueado, o Jarvis aparece como um cartão pequeno no topo, por
  cima do aplicativo em uso, e some quando volta a aguardar. A tela cheia fica para quando o
  celular está bloqueado ou você abre o app.
- **Conversa contínua**: depois de uma resposta da inteligência, ele ouve a próxima fala sem
  exigir o nome; se você não disser nada, volta a aguardar. Dá para desligar na tela.
- **Modo live**: diga "modo live" (ou toque no botão) e a conversa segue sem parar, sem repetir
  "Jarvis". Ele olha a tela quando você fala do que está vendo. Termina com "sair do modo live",
  pelo botão, ou depois de quatro silêncios seguidos. O microfone fica aberto durante esse tempo.
- **Memória local**: o que ele aprende sobre você, as conversas e os lembretes ficam em arquivos
  no próprio aparelho. Ele guarda sozinho o que você conta de duradouro, e as últimas conversas
  voltam como contexto quando o app é reaberto. Para responder, esses textos são enviados à
  inteligência junto com a sua fala.
- **WhatsApp para quem não escreveu**: "manda um WhatsApp para o João dizendo que cheguei" abre a
  conversa, e, com o controle da tela ativado, toca em enviar depois do seu "sim".

## Conversa mais natural e avisos

- **Nome e comando juntos**: com a voz natural ativa, dá para dizer "Jarvis, abre o YouTube" de
  uma vez. O áudio dito depois do nome é transcrito pela ElevenLabs. Sem a chave, ou se a
  transcrição falhar, vale o fluxo de sempre: "Jarvis", "Sim, mestre?", comando.
- **Resposta em tempo real**: a resposta chega da inteligência em fluxo e cada frase é falada
  assim que fecha, enquanto as seguintes ainda estão sendo geradas.
- **Sua fala na tela**: o que você diz aparece enquanto você ainda está falando.
- **Interromper**: diga "Jarvis" enquanto ele fala e ele se cala e ouve; durante uma tarefa,
  o mesmo comando para a tarefa.
- **"Bom dia"**: resumo do dia com agenda, mensagens e, se houver chaves da Cakto, vendas de ontem.
- **Avisos**: 15 minutos antes de cada compromisso (ligado de fábrica) e, se você ligar, o
  nome de quem mandou mensagem. O conteúdo da mensagem só é lido quando você pede.
- **Limite de gasto**: um teto diário em dólares para a inteligência, estimado pelos tokens de
  cada resposta (buscas na internet são cobradas à parte e não entram). Ao atingir, o Jarvis
  avisa e para de consultar a inteligência até o dia seguinte; os comandos simples continuam.
- **Últimas conversas** aparecem na tela do Jarvis.

A inteligência usa o Claude Haiku 5.5, o modelo mais rápido e barato da família.

## Mexer na tela (acessibilidade)

Com o botão **Deixar o Jarvis mexer na tela**, você ativa o Jarvis em Configurações >
Acessibilidade e ele passa a ler a tela de qualquer aplicativo e a tocar, digitar e rolar
por você. Em Android 13 ou mais novo, vale o mesmo desbloqueio de "configurações restritas"
descrito acima.

Essa é a permissão mais forte que um app pode ter: ele enxerga tudo o que aparece na tela.
Por isso os limites estão no código (`core/Limites.kt`), e não nas instruções da inteligência:

- **Bancos, carteiras e pagamentos**: ele não lê nem toca. A lista cobre os apps mais usados
  no Brasil e qualquer app com "banco", "bank", "wallet" ou "pagamento" no nome; um app de
  banco pouco conhecido pode escapar dela.
- **Senhas**: campos de senha não aparecem para ele e não podem ser preenchidos.
- **Ações sérias**: tocar em Enviar, Publicar, Compartilhar, Comprar, Pagar, Excluir e
  parecidos só acontece depois do seu "sim". Curtir, seguir e rolar não perguntam. Um botão
  que é só um ícone sem nome não é reconhecido como sério.
- **Parar**: diga "Jarvis" no meio de uma tarefa. Uma faixa no topo mostra o passo atual.

O que ele lê da tela é enviado à Anthropic para decidir o próximo toque. Cada passo é uma
consulta à inteligência, então tarefas longas custam mais.

## Chaves opcionais

- **Voz natural (ElevenLabs)**: cole a chave na tela do Jarvis e ele passa a falar com voz
  natural. Sem chave, ou se o áudio falhar, usa a voz do próprio celular. Frases curtas que se
  repetem ficam guardadas no aparelho para não serem geradas de novo.
- **Vendas (Cakto)**: crie uma chave de API no painel da Cakto, com os escopos de leitura e
  pedidos, e cole o client id e o client secret.

As chaves ficam só no aparelho. Quem tiver o celular desbloqueado nas mãos consegue usá-las.

## Como funciona

- **Agente**: a fala vai para o Claude junto com a lista de ferramentas do aparelho
  (`app/.../FerramentasDoAparelho.kt`). Ele pede as ferramentas, o app executa e devolve
  o resultado, até sair uma resposta para falar. Esse vaivém mora em `core/Agente.kt`
  e é testado com um servidor falso no lugar da API. O texto de mensagens recebidas é
  tratado como informação, nunca como ordem.

- **Escuta de fundo**: um serviço com notificação fixa lê o microfone o tempo todo.
  O áudio passa por dois detectores: o de palmas (`core/DetectorPalmas.kt`) e um
  reconhecedor de fala offline (Vosk) que só conhece a palavra "Jarvis". Nada
  desse áudio sai do aparelho. O modelo é o de inglês porque o de português não
  tem "Jarvis" no vocabulário.
- **Comando**: depois de acordar, o Jarvis responde "Sim?" e usa o reconhecimento de voz do próprio
  Android para entender a frase, que é interpretada em `core/Interpretador.kt` e
  executada em `app/.../Executor.kt`.
- O microfone é usado por uma coisa de cada vez: enquanto o Jarvis fala ou ouve o
  comando, a escuta de fundo fica pausada.

## Limites conhecidos

- Escutar o tempo todo gasta bateria.
- Se o sistema encerrar o app, ele não volta sozinho: é preciso abrir e ativar de novo
  (o Android não permite religar o microfone em segundo plano).
- Com a tela bloqueada o Jarvis ouve, aparece e responde. Para abrir outro app, ele pede o
  desbloqueio (senha ou digital) e abre em seguida; sem senha no celular, abre direto.
  O Android não permite abrir outros apps por cima de um bloqueio com senha.
- Sem a chave da inteligência, "Ligar para Maria" só abre o discador.
- Responder pelo WhatsApp só funciona enquanto a notificação da conversa ainda está na barra.
- A leitura de mensagens depende de como cada app monta a notificação; em grupos, o nome
  de quem escreveu pode vir junto do nome do grupo.

## Para desenvolver

```bash
./gradlew :core:test          # testes da lógica; só precisa de Java
./scripts/baixar-modelo.sh    # baixa o modelo de voz (uma vez)
./gradlew :app:assembleDebug  # gera o APK; precisa do Android SDK
```
