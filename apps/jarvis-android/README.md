# Jarvis para Android

Assistente de voz que fica escutando em segundo plano e acorda quando você
diz **"Jarvis"** ou bate **3 palmas seguidas**. Depois de acordar, ele ouve um
comando, executa e responde falando.

Este app é independente do restante do repositório.

## O que ele entende

Chame ("Jarvis" ou 3 palmas), espere ele responder "Sim?" e diga o comando.

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
| "Desligar" | Para de escutar |

## Como instalar

1. Baixe o `jarvis.apk` (gerado pelo GitHub Actions, em **Actions > Jarvis Android > último resultado > jarvis-apk**).
2. Abra o arquivo no celular e permita instalar apps dessa origem.
3. Abra o Jarvis, toque em **Ativar o Jarvis** e aceite microfone e notificações.
4. Toque em **Permitir abrir apps em segundo plano**. Sem isso, o Android só deixa
   o Jarvis abrir outros apps enquanto a tela dele está aberta.
5. Toque em **Não deixar o sistema pausar o Jarvis**, para ele continuar ouvindo com a tela apagada.

## Como funciona

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
- Com a tela bloqueada o Jarvis ouve e responde, mas apps abertos ficam atrás do bloqueio.
- "Ligar para Maria" só abre o discador; ele ainda não procura contatos.

## Para desenvolver

```bash
./gradlew :core:test          # testes da lógica; só precisa de Java
./scripts/baixar-modelo.sh    # baixa o modelo de voz (uma vez)
./gradlew :app:assembleDebug  # gera o APK; precisa do Android SDK
```
