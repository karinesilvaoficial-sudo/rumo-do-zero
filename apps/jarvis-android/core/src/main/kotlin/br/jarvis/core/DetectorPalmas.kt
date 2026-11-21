package br.jarvis.core

import kotlin.math.sqrt

/**
 * Detecta uma sequência de palmas no áudio do microfone.
 *
 * Uma palma é um estalo: o volume sobe de repente bem acima do ruído do
 * ambiente e cai em poucos centésimos de segundo. Fala e música também são
 * altas, mas duram mais, então são descartadas pela duração.
 *
 * Alimente com [processar] em blocos de qualquer tamanho; devolve `true`
 * no instante em que a sequência completa de palmas é reconhecida.
 */
class DetectorPalmas(
    private val taxaAmostragem: Int = 16000,
    private val palmasNecessarias: Int = 3,
    /** Volume mínimo (RMS, 0 a 32767) para um estalo contar. Menor = mais sensível. */
    var limiarMinimo: Double = 2000.0,
) {
    private val tamanhoQuadro = taxaAmostragem / 100 // 10 ms
    private val quadro = ShortArray(tamanhoQuadro)
    private var preenchido = 0

    private var tempoMs = 0L
    private var ruido = 200.0
    private var limiarDoEstalo = 0.0
    private var emEstalo = false
    private var inicioEstalo = 0L
    private var descartado = false
    private var fimUltimoEstalo = -10_000L
    private val palmas = ArrayList<Long>()

    fun reiniciar() {
        preenchido = 0
        emEstalo = false
        descartado = false
        palmas.clear()
        fimUltimoEstalo = tempoMs
    }

    fun processar(amostras: ShortArray, quantidade: Int): Boolean {
        var detectou = false
        for (i in 0 until quantidade) {
            quadro[preenchido++] = amostras[i]
            if (preenchido == tamanhoQuadro) {
                preenchido = 0
                if (processarQuadro()) detectou = true
            }
        }
        return detectou
    }

    private fun processarQuadro(): Boolean {
        var soma = 0.0
        for (a in quadro) soma += a.toDouble() * a
        val rms = sqrt(soma / tamanhoQuadro)
        tempoMs += 10

        if (emEstalo) {
            val duracao = tempoMs - inicioEstalo
            if (rms < limiarDoEstalo * FRACAO_FIM) {
                emEstalo = false
                fimUltimoEstalo = tempoMs
                if (!descartado && duracao <= DURACAO_MAXIMA_MS) return registrarPalma(inicioEstalo)
            } else if (duracao > DURACAO_MAXIMA_MS) {
                // Som longo demais para ser palma (fala, música): descarta e zera a contagem.
                descartado = true
                palmas.clear()
                if (duracao > 1000) {
                    // Barulho contínuo: passa a tratá-lo como o novo ruído do ambiente.
                    emEstalo = false
                    fimUltimoEstalo = tempoMs
                    ruido = rms
                }
            }
            return false
        }

        val limiar = maxOf(limiarMinimo, ruido * FATOR_SOBRE_RUIDO)
        if (rms >= limiar && tempoMs - fimUltimoEstalo >= PAUSA_MINIMA_MS) {
            emEstalo = true
            descartado = false
            inicioEstalo = tempoMs
            limiarDoEstalo = limiar
        } else {
            // Acompanha o ruído do ambiente: sobe devagar, desce mais rápido.
            val peso = if (rms > ruido) 0.02 else 0.1
            ruido += (rms - ruido) * peso
        }
        return false
    }

    private fun registrarPalma(instante: Long): Boolean {
        if (palmas.isNotEmpty() && instante - palmas.last() > INTERVALO_MAXIMO_MS) palmas.clear()
        palmas.add(instante)
        if (palmas.size >= palmasNecessarias) {
            palmas.clear()
            return true
        }
        return false
    }

    companion object {
        /** Uma palma, com o eco da sala, não passa disso. */
        const val DURACAO_MAXIMA_MS = 220L
        /** Tempo máximo entre uma palma e a seguinte. */
        const val INTERVALO_MAXIMO_MS = 1000L
        /** Silêncio mínimo entre dois estalos. */
        const val PAUSA_MINIMA_MS = 120L
        const val FATOR_SOBRE_RUIDO = 6.0
        const val FRACAO_FIM = 0.4

        /** Quantas palmas seguidas acordam o Jarvis. Uma só dispararia com qualquer batida ou porta. */
        const val PALMAS_PARA_ACORDAR = 2

        /** Converte a sensibilidade da tela (1 a 10) no volume mínimo de um estalo. */
        fun limiarParaSensibilidade(sensibilidade: Int): Double {
            val s = sensibilidade.coerceIn(1, 10)
            // 1 -> 4000 (só palmas fortes e próximas) ... 10 -> 900 (palmas fracas ou distantes).
            // Abaixo disso, qualquer par de estalos (teclas, talheres, passos) acordava o Jarvis sozinho.
            return 4000.0 * Math.pow(900.0 / 4000.0, (s - 1) / 9.0)
        }
    }
}
