package br.jarvis.core

/**
 * Decide se uma fala vai para a inteligência mesmo tendo cara de comando simples.
 * Os comandos simples são reconhecidos por palavras soltas ("horas", "bateria", "que dia"),
 * o que é ótimo para "que horas são?", mas engoliria pedidos como "que horas é minha reunião
 * de amanhã?". Com a inteligência disponível, frases mais longas desse tipo vão para ela.
 */
object Roteador {
    private const val FRASE_CURTA = 4

    fun paraAInteligencia(fala: String, comando: Comando, temInteligencia: Boolean): Boolean {
        if (!temInteligencia) return false
        return when (comando) {
            is Comando.Desconhecido -> true
            // Ligar para um nome exige procurar nos contatos, o que só a inteligência faz.
            is Comando.Ligar -> comando.destino.none { it.isDigit() }
            // "Tocar X" sem falar em YouTube: a inteligência toca direto no aplicativo de música.
            is Comando.TocarNoYoutube -> !Texto.normalizar(fala).contains("youtube")
            // "Bom dia" pede o resumo do dia (agenda, mensagens, vendas), que só a inteligência monta.
            Comando.Saudacao -> Texto.normalizar(fala).startsWith("bom dia") ||
                Texto.normalizar(fala).split(" ").count { it.isNotEmpty() } > FRASE_CURTA
            Comando.Horas, Comando.Data, Comando.Bateria, Comando.Ajuda, Comando.Agradecimento ->
                Texto.normalizar(fala).split(" ").count { it.isNotEmpty() } > FRASE_CURTA
            else -> false
        }
    }

    /**
     * A pessoa pediu para ligar ou desligar o modo live (conversa contínua)? Devolve `true` para
     * ligar, `false` para desligar e `null` quando a fala não é sobre isso.
     */
    fun pedidoDeLive(fala: String): Boolean? {
        val palavras = Texto.normalizar(fala).split(" ").filter { it.isNotEmpty() }
        val texto = palavras.joinToString(" ")
        val citaOModo = texto.contains("ao vivo") || "live" in palavras || "laive" in palavras || "laiv" in palavras
        // Frases longas que só mencionam a palavra ("tem jogo ao vivo hoje?") não são um pedido.
        if (!citaOModo || palavras.size > 6) return null
        val sair = listOf("sair", "sai", "desliga", "desligar", "parar", "para", "pare", "encerrar", "encerra", "fechar", "fecha", "desativar", "desativa")
        return palavras.none { it in sair }
    }

    /**
     * Depois de falar, o Jarvis só continua ouvindo se ele mesmo fez uma pergunta
     * ("Posso enviar?", "Qual aplicativo, mestre?"). Fora isso, volta a esperar o nome
     * ou as palmas: assim uma conversa ao lado ou a TV não viram comando.
     */
    fun esperaResposta(falaDoJarvis: String): Boolean = falaDoJarvis.trimEnd().endsWith("?")
}
