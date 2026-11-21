package br.jarvis.core

import java.io.File

/**
 * Registro das conversas passadas, para o Jarvis poder consultar o que foi dito em outros
 * dias. Uma troca por linha (quando, o que a pessoa disse, o que ele respondeu), num
 * arquivo que fica só no aparelho.
 */
class Diario(private val arquivo: File) {
    class Troca(val quando: String, val fala: String, val resposta: String)

    @Synchronized
    fun registrar(quando: String, fala: String, resposta: String) {
        val linhas = ler() + listOf(limpar(quando), limpar(fala), limpar(resposta).take(600)).joinToString("\t")
        arquivo.parentFile?.mkdirs()
        // Passou do limite: as conversas mais antigas saem primeiro.
        arquivo.writeText(linhas.takeLast(MAXIMO_DE_TROCAS).joinToString("\n"))
    }

    /** As trocas mais recentes que contêm todas as palavras de [busca]; sem busca, as últimas. */
    @Synchronized
    fun buscar(busca: String, limite: Int): List<Troca> {
        val palavras = Texto.normalizar(busca).split(" ").filter { it.length >= 3 }
        return ler().mapNotNull { linha ->
            val partes = linha.split("\t")
            if (partes.size < 3) null else Troca(partes[0], partes[1], partes[2])
        }.filter { troca ->
            val conteudo = Texto.normalizar(troca.fala + " " + troca.resposta)
            palavras.all { conteudo.contains(it) }
        }.takeLast(limite)
    }

    fun ferramenta() = Ferramenta(
        nome = "conversas_anteriores",
        descricao = "Consulta o que a pessoa e você conversaram em outros dias. Use quando ela se referir a algo dito " +
            "antes que não está nesta conversa (o que eu te pedi ontem, aquele restaurante que comentei).",
        parametros = mapOf(
            "busca" to Parametro("string", "Palavras-chave do assunto. Em branco, traz as conversas mais recentes.", obrigatorio = false),
        ),
    ) { a ->
        val trocas = buscar(a.texto("busca"), 12)
        if (trocas.isEmpty()) "Nenhuma conversa anterior sobre isso."
        else trocas.joinToString("\n") { "[${it.quando}] Ela disse: \"${it.fala}\". Você respondeu: \"${it.resposta}\"" }
    }

    private fun ler(): List<String> = if (arquivo.exists()) arquivo.readLines().filter { it.isNotBlank() } else emptyList()

    private fun limpar(texto: String) = texto.replace(Regex("[\\t\\r\\n]+"), " ").trim()

    companion object {
        const val MAXIMO_DE_TROCAS = 400
    }
}
