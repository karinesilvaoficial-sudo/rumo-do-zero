package br.jarvis.core

import java.io.File

/**
 * Soma quanto a inteligência custou hoje e segura o uso quando passa do limite que a pessoa
 * definiu. É uma estimativa pelo número de tokens de cada resposta; buscas na internet são
 * cobradas à parte pela Anthropic e não entram na conta.
 */
class Gasto(
    private val arquivo: File,
    private val hoje: () -> String,
    /** Preço em dólares por milhão de tokens de entrada e de saída do modelo em uso. */
    private val precoDaEntrada: Double = PRECO_DA_ENTRADA,
    private val precoDaSaida: Double = PRECO_DA_SAIDA,
) {
    /** Dólares gastos hoje. */
    @Synchronized
    fun deHoje(): Double {
        if (!arquivo.exists()) return 0.0
        val partes = arquivo.readText().trim().split("\t")
        return if (partes.size == 2 && partes[0] == hoje()) partes[1].toDoubleOrNull() ?: 0.0 else 0.0
    }

    @Synchronized
    fun registrar(tokensDeEntrada: Long, tokensDeSaida: Long) {
        val total = deHoje() + (tokensDeEntrada * precoDaEntrada + tokensDeSaida * precoDaSaida) / 1_000_000.0
        arquivo.parentFile?.mkdirs()
        arquivo.writeText(hoje() + "\t" + total)
    }

    /** [limite] em dólares por dia; zero ou negativo significa sem limite. */
    fun dentroDoLimite(limite: Double): Boolean = limite <= 0.0 || deHoje() < limite

    companion object {
        /** Claude Haiku 5.5, para pedidos de até 100 mil tokens. */
        const val PRECO_DA_ENTRADA = 0.10
        const val PRECO_DA_SAIDA = 0.50
    }
}
