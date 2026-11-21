# Jarvis para Android

Assistente de voz que fica escutando em segundo plano e acorda quando você
diz **"Jarvis"** ou bate **2 palmas seguidas**. Depois de acordar, ele ouve um
comando, executa e responde falando.

Com a chave da inteligência, ele deixa de ser só um app de comandos e vira um
**agente pessoal**: você fala e ele resolve, consultando sua agenda, seus contatos
e as mensagens que chegam no celular.

Este app é independente do restante do repositório.

![Estados do painel](docs/previa-painel.png)

O painel é animado e cada movimento mostra algo: os anéis giram mais rápido quando
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
| "Manda um WhatsApp pro João dizendo…" | Abre a conversa com o texto pronto; você toca em enviar |
| "Escreve um e-mail para…" | Abre o rascunho no app de e-mail; você revisa e envia |
| "Liga para a Maria" | Acha o contato e deixa o número pronto no telefone |
| "Lembra que minha irmã se chama Ana" | Guarda para as próximas conversas |

As linhas a partir de "O que tenho na agenda" precisam da chave da inteligência.
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
viram uma pesquisa na internet. Depois de responder, o Jarvis continua ouvindo a
próxima fala, sem precisar chamar de novo, até você ficar em silêncio.

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
- **Memória**: o que você manda lembrar fica em um arquivo no aparelho e é apagado
  se você desinstalar o app ou disser "esquece que…".
- O número de WhatsApp sem código de país é tratado como brasileiro (+55).

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
