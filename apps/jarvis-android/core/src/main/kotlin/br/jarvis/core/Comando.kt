package br.jarvis.core

/** O que o Jarvis entendeu de uma frase. */
sealed class Comando {
    /** Abrir um app pelo nome falado. */
    data class AbrirApp(val nome: String) : Comando()
    /** "Jarvis, abrir" sem dizer o quê: abre a tela do próprio Jarvis. */
    data object AbrirJarvis : Comando()
    data object Horas : Comando()
    data object Data : Comando()
    data object Bateria : Comando()
    data class Pesquisar(val termo: String) : Comando()
    data class TocarNoYoutube(val termo: String) : Comando()
    data class Lanterna(val ligar: Boolean) : Comando()
    data class Volume(val acao: AcaoVolume) : Comando()
    data class Temporizador(val segundos: Int) : Comando()
    data class Alarme(val hora: Int, val minuto: Int) : Comando()
    data class Ligar(val destino: String) : Comando()
    /** Mensagem de WhatsApp. [texto] mantém a escrita original (acentos, maiúsculas). */
    data class Mensagem(val destino: String, val texto: String) : Comando()
    data object Saudacao : Comando()
    data object Agradecimento : Comando()
    data object Ajuda : Comando()
    /** Parar de escutar (desliga o serviço). */
    data object Desligar : Comando()
    data object Cancelar : Comando()
    data class Desconhecido(val texto: String) : Comando()
    data object Vazio : Comando()
}

enum class AcaoVolume { AUMENTAR, DIMINUIR, MUDO, MAXIMO }
