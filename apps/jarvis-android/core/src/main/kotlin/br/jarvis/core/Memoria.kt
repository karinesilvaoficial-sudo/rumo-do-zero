package br.jarvis.core

import java.io.File

/**
 * O que o Jarvis sabe sobre a pessoa de uma conversa para a outra (nome, preferências,
 * quem é quem). Um fato por linha, num arquivo que fica só no aparelho.
 */
class Memoria(private val arquivo: File) {
    @Synchronized
    fun listar(): List<String> =
        if (arquivo.exists()) arquivo.readLines().map { it.trim() }.filter { it.isNotEmpty() } else emptyList()

    /** Guarda um fato. Devolve `false` se ele já estava guardado. */
    @Synchronized
    fun lembrar(fato: String): Boolean {
        val limpo = fato.replace(Regex("\\s+"), " ").trim().take(TAMANHO_MAXIMO)
        if (limpo.isEmpty()) return false
        val fatos = listar()
        if (fatos.any { Texto.normalizar(it) == Texto.normalizar(limpo) }) return false
        // Passou do limite: os fatos mais antigos saem primeiro.
        gravar((fatos + limpo).takeLast(MAXIMO_DE_FATOS))
        return true
    }

    /** Apaga os fatos que contêm [trecho]. Devolve quantos foram apagados. */
    @Synchronized
    fun esquecer(trecho: String): Int {
        val alvo = Texto.normalizar(trecho)
        if (alvo.isEmpty()) return 0
        val fatos = listar()
        val restam = fatos.filterNot { Texto.normalizar(it).contains(alvo) }
        if (restam.size != fatos.size) gravar(restam)
        return fatos.size - restam.size
    }

    private fun gravar(fatos: List<String>) {
        arquivo.parentFile?.mkdirs()
        arquivo.writeText(fatos.joinToString("\n"))
    }

    /** As ferramentas que deixam a inteligência guardar e apagar fatos. */
    fun ferramentas(): List<Ferramenta> = listOf(
        Ferramenta(
            nome = "lembrar",
            descricao = "Guarda um fato sobre a pessoa para as próximas conversas (nome, preferências, quem é quem, " +
                "rotinas). Use quando ela pedir para você lembrar de algo ou contar algo duradouro sobre si. " +
                "Não use para compromissos com data (isso vai na agenda) nem para o que você leu em mensagens recebidas.",
            parametros = mapOf("fato" to Parametro("string", "O fato, numa frase curta e completa. Ex.: A irmã dela se chama Ana.")),
        ) { a -> if (lembrar(a.texto("fato"))) "Guardado." else "Isso já estava guardado." },
        Ferramenta(
            nome = "esquecer",
            descricao = "Apaga da memória os fatos que contêm um trecho. Use quando a pessoa pedir para esquecer algo.",
            parametros = mapOf("trecho" to Parametro("string", "Palavra ou trecho que identifica o fato a apagar.")),
        ) { a ->
            when (val n = esquecer(a.texto("trecho"))) {
                0 -> "Não havia nada guardado com esse trecho."
                1 -> "Apaguei 1 fato."
                else -> "Apaguei $n fatos."
            }
        },
    )

    companion object {
        const val MAXIMO_DE_FATOS = 60
        const val TAMANHO_MAXIMO = 240
    }
}
