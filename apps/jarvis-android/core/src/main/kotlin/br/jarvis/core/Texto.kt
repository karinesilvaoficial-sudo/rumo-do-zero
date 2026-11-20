package br.jarvis.core

import java.text.Normalizer

/** Funções de texto usadas para comparar o que foi falado com comandos e nomes de apps. */
object Texto {
    private val acentos = Regex("\\p{InCombiningDiacriticalMarks}+")
    private val naoAlfanumerico = Regex("[^a-z0-9: ]+")
    private val espacos = Regex("\\s+")

    /** Minúsculas, sem acentos, sem pontuação e com espaços simples. */
    fun normalizar(texto: String): String {
        val semAcento = acentos.replace(Normalizer.normalize(texto.lowercase(), Normalizer.Form.NFD), "")
        return espacos.replace(naoAlfanumerico.replace(semAcento, " "), " ").trim()
    }

    /** Distância de edição entre duas palavras. */
    fun distancia(a: String, b: String): Int {
        if (a == b) return 0
        if (a.isEmpty()) return b.length
        if (b.isEmpty()) return a.length
        var anterior = IntArray(b.length + 1) { it }
        var atual = IntArray(b.length + 1)
        for (i in 1..a.length) {
            atual[0] = i
            for (j in 1..b.length) {
                val custo = if (a[i - 1] == b[j - 1]) 0 else 1
                atual[j] = minOf(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + custo)
            }
            val troca = anterior
            anterior = atual
            atual = troca
        }
        return anterior[b.length]
    }

    /** Semelhança de 0 a 1 entre dois textos já normalizados. */
    fun semelhanca(a: String, b: String): Double {
        val maior = maxOf(a.length, b.length)
        if (maior == 0) return 1.0
        return 1.0 - distancia(a, b).toDouble() / maior
    }

    /**
     * Escolhe, entre [candidatos], o nome mais parecido com [falado].
     * Devolve o índice do melhor candidato, ou -1 se nenhum for parecido o bastante.
     */
    fun melhorCorrespondencia(falado: String, candidatos: List<String>): Int {
        val alvo = normalizar(falado)
        if (alvo.isEmpty()) return -1
        val alvoJunto = alvo.replace(" ", "")
        var melhor = -1
        var melhorNota = 0.0
        candidatos.forEachIndexed { i, bruto ->
            val nome = normalizar(bruto)
            if (nome.isEmpty()) return@forEachIndexed
            val nomeJunto = nome.replace(" ", "")
            val nota = when {
                nome == alvo || nomeJunto == alvoJunto -> 1.0
                nome.split(" ").contains(alvo) -> 0.9
                nomeJunto.startsWith(alvoJunto) && alvoJunto.length >= 3 ->
                    0.8 + 0.1 * alvoJunto.length / nomeJunto.length
                nomeJunto.contains(alvoJunto) && alvoJunto.length >= 4 -> 0.75
                alvoJunto.contains(nomeJunto) && nomeJunto.length >= 4 -> 0.7
                else -> semelhanca(alvoJunto, nomeJunto).let { if (it >= 0.72) it * 0.9 else 0.0 }
            }
            if (nota > melhorNota) {
                melhorNota = nota
                melhor = i
            }
        }
        return melhor
    }
}
