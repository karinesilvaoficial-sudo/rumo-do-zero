package br.jarvis.core

import java.io.File

/** Um aviso que o Jarvis fala em um horário marcado. */
data class Lembrete(val id: Int, val quando: Long, val texto: String)

/** Os lembretes pendentes, guardados no aparelho para sobreviverem a um reinício do celular. */
class Lembretes(private val arquivo: File) {
    @Synchronized
    fun listar(): List<Lembrete> =
        if (!arquivo.exists()) emptyList()
        else arquivo.readLines().mapNotNull { linha ->
            val partes = linha.split("\t", limit = 3)
            val id = partes.getOrNull(0)?.toIntOrNull()
            val quando = partes.getOrNull(1)?.toLongOrNull()
            if (id == null || quando == null || partes.size < 3) null else Lembrete(id, quando, partes[2])
        }.sortedBy { it.quando }

    @Synchronized
    fun criar(quando: Long, texto: String): Lembrete {
        val atuais = listar()
        val novo = Lembrete((atuais.maxOfOrNull { it.id } ?: 0) + 1, quando, texto.replace(Regex("[\\t\\r\\n]+"), " ").trim())
        gravar(atuais + novo)
        return novo
    }

    /** Remove e devolve o lembrete, ou `null` se ele não existe mais. */
    @Synchronized
    fun remover(id: Int): Lembrete? {
        val atuais = listar()
        val alvo = atuais.firstOrNull { it.id == id } ?: return null
        gravar(atuais - alvo)
        return alvo
    }

    /** O pendente cujo texto mais parece com [trecho], para "cancela o lembrete do remédio". */
    fun achar(trecho: String): Lembrete? {
        val atuais = listar()
        val i = Texto.melhorCorrespondencia(trecho, atuais.map { it.texto })
        return atuais.getOrNull(i)
    }

    private fun gravar(lista: List<Lembrete>) {
        arquivo.parentFile?.mkdirs()
        arquivo.writeText(lista.joinToString("\n") { "${it.id}\t${it.quando}\t${it.texto}" })
    }
}
