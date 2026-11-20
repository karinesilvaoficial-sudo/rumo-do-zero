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
            Comando.Horas, Comando.Data, Comando.Bateria, Comando.Ajuda, Comando.Saudacao, Comando.Agradecimento ->
                Texto.normalizar(fala).split(" ").count { it.isNotEmpty() } > FRASE_CURTA
            else -> false
        }
    }
}
