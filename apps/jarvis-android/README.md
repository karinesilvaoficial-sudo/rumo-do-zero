# Jarvis para Android

Assistente de voz que fica escutando em segundo plano e acorda quando você
diz **"Jarvis"** ou bate **3 palmas seguidas**. Depois de acordar, ele ouve um
comando, executa e responde falando.

Este app é independente do restante do repositório.

![Estados do painel](docs/previa-painel.png)

O painel é animado e cada movimento mostra algo: os anéis giram mais rápido quando
o Jarvis está pensando, as barras em volta do núcleo acompanham o som do microfone
enquanto ele ouve, e uma onda se abre do centro quando ele é chamado. (A imagem é
uma prévia desenhada com as mesmas medidas do app, não uma captura do celular.)

## O que ele entende

Em Android 13 ou mais novo, diga tudo de uma vez: "Jarvis, abrir YouTube". Em aparelhos
mais antigos (ou se você desligar essa opção), chame, espere o "Sim?" e diga o comando.
Com as palmas, bata 3 vezes e fale em seguida.

| Você diz | O que acontece |
| --- | --- |
| "Jarvis, abrir YouTube" | Abre o app pelo nome (qualquer app instalado) |
| "Jarvis abrir" | Abre a tela do próprio Jarvis |
| "Que horas são?" / "Que dia é hoje?" | Responde falando |
| "Pesquisar receita de bolo" | Pesquisa na internet |
| "Tocar Legião Urbana" | Procura no YouTube |
| "Ligar a lanterna" / "Desligar a lanterna" | Controla a lanterna |
| "Aumentar o volume" / "Silenciar" | Muda o volume de mídia |
| "Timer de 5 minutos" / "Alarme para 7 e meia" | Cria no app Relógio |
| "Como está a bateria?" | Responde a porcentagem |
| "Ligar para Maria" | Liga para o contato (avisa o nome antes de discar) |
| "Mandar mensagem para João dizendo que estou chegando" | Abre o WhatsApp com a mensagem escrita; você toca em enviar |
| Frases livres, como "põe um alarme pras sete e abre o Spotify" | A inteligência entende e executa (precisa da chave) |
| Qualquer outra pergunta ou conversa | Responde falando, pela inteligência (Claude) |
| "Desligar" | Para de escutar |

## Como instalar

1. Baixe o `jarvis.apk` (gerado pelo GitHub Actions, em **Actions > Jarvis Android > último resultado > jarvis-apk**).
2. Abra o arquivo no celular e permita instalar apps dessa origem.
3. Abra o Jarvis, toque em **Ativar o Jarvis** e aceite microfone e notificações.
4. Toque em **Permitir aparecer na tela e abrir apps**. Sem isso, o Android não deixa
   o Jarvis aparecer quando é chamado nem abrir outros apps em segundo plano.
5. Toque em **Não deixar o sistema pausar o Jarvis**, para ele continuar ouvindo com a tela apagada.
6. Toque em **Permitir contatos e ligações** se quiser ligar e mandar mensagens pelo nome.

## Conversar (responder qualquer pergunta)

O que não é um comando conhecido vai para o Claude, da Anthropic, que responde
em voz alta e pode buscar na internet. Para isso, crie uma chave em
console.anthropic.com e cole no campo **Chave** da tela do Jarvis. O uso é cobrado
na conta da chave; ela fica guardada só no aparelho. Sem chave, perguntas livres
viram uma pesquisa na internet. Depois de responder, o Jarvis continua ouvindo a
próxima fala, sem precisar chamar de novo, até você ficar em silêncio.

## Como funciona

- **Escuta de fundo**: um serviço com notificação fixa lê o microfone o tempo todo.
  O áudio passa por dois detectores: o de palmas (`core/DetectorPalmas.kt`) e um
  reconhecedor de fala offline (Vosk) que só conhece a palavra "Jarvis". Nada
  desse áudio sai do aparelho. O modelo é o de inglês porque o de português não
  tem "Jarvis" no vocabulário.
- **Comando**: depois de acordar, o Jarvis usa o reconhecimento de voz do próprio
  Android para entender a frase, que é interpretada em `core/Interpretador.kt` e
  executada em `app/.../Executor.kt`.
- O microfone é usado por uma coisa de cada vez: enquanto o Jarvis fala ou ouve o
  comando, a escuta de fundo fica pausada.

## Limites conhecidos

- Escutar o tempo todo gasta bateria.
- Se o sistema encerrar o app, ele não volta sozinho: é preciso abrir e ativar de novo
  (o Android não permite religar o microfone em segundo plano).
- Com a tela bloqueada o Jarvis ouve e responde, mas apps abertos ficam atrás do bloqueio.
- A mensagem de WhatsApp fica escrita na conversa; o envio depende do seu toque (o WhatsApp não permite envio automático).
- A frase única depende do reconhecedor de voz do aparelho aceitar áudio vindo do app. Se ele não devolver nada duas vezes seguidas, o Jarvis volta sozinho ao modo de duas etapas até ser reativado.

## Para desenvolver

```bash
./gradlew :core:test          # testes da lógica; só precisa de Java
./scripts/baixar-modelo.sh    # baixa o modelo de voz (uma vez)
./gradlew :app:assembleDebug  # gera o APK; precisa do Android SDK
```
