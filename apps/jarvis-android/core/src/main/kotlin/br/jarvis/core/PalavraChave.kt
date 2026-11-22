package br.jarvis.core

/** Reconhece a palavra de ativação ("Jarvis") dentro do texto ouvido. */
object PalavraChave {
    /**
     * Formas como o nome pode chegar escrito. A escuta de fundo sempre devolve
     * "jarvis"; as outras aparecem quando o reconhecedor do Android transcreve
     * um comando em que a pessoa repetiu o nome.
     */
    val formas = listOf("jarvis", "jarvas", "jarves", "jarviz", "jarbas", "jarvi", "djarvis", "jervis", "jarvys")

    /** Resultado: se a palavra foi dita e o que veio depois dela. */
    data class Resultado(val ativou: Boolean, val resto: String)

    fun procurar(texto: String): Resultado {
        val palavras = Texto.normalizar(texto).split(" ").filter { it.isNotEmpty() }
        // Aceita também uma letra de diferença ("javis", "jarviz"): o reconhecedor do Android varia a grafia.
        val i = palavras.indexOfFirst { it in formas || Texto.distancia(it, "jarvis") <= 1 }
        if (i < 0) return Resultado(false, "")
        return Resultado(true, palavras.drop(i + 1).joinToString(" "))
    }
}
