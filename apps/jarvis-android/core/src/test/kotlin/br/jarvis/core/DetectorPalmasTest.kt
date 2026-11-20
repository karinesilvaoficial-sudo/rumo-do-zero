package br.jarvis.core

import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals

class DetectorPalmasTest {
    private val taxa = 16000
    private val rnd = Random(42)

    /** Monta um áudio de [ms] milissegundos com ruído de fundo fraco. */
    private fun audio(ms: Int, ruido: Int = 150) = ShortArray(taxa * ms / 1000) { rnd.nextInt(-ruido, ruido + 1).toShort() }

    /** Soma uma palma (estalo de ruído que decai em ~40 ms) na posição [emMs]. */
    private fun palma(a: ShortArray, emMs: Int, forca: Int = 15000) {
        val inicio = taxa * emMs / 1000
        for (k in 0 until taxa * 80 / 1000) {
            val env = exp(-k / (taxa * 0.012))
            val v = a[inicio + k] + (rnd.nextDouble(-1.0, 1.0) * forca * env).toInt()
            a[inicio + k] = v.coerceIn(-32768, 32767).toShort()
        }
    }

    /** Soma um som contínuo (como uma vogal falada) de [duracaoMs]. */
    private fun tom(a: ShortArray, emMs: Int, duracaoMs: Int, forca: Int = 12000) {
        val inicio = taxa * emMs / 1000
        for (k in 0 until taxa * duracaoMs / 1000) {
            val v = a[inicio + k] + (sin(2 * PI * 220 * k / taxa) * forca).toInt()
            a[inicio + k] = v.coerceIn(-32768, 32767).toShort()
        }
    }

    /** Passa o áudio em blocos de 100 ms, como o serviço faz, e conta as ativações. */
    private fun ativacoes(a: ShortArray, detector: DetectorPalmas = DetectorPalmas(taxa)): Int {
        var n = 0
        val bloco = ShortArray(1600)
        var pos = 0
        while (pos < a.size) {
            val q = minOf(bloco.size, a.size - pos)
            System.arraycopy(a, pos, bloco, 0, q)
            if (detector.processar(bloco, q)) n++
            pos += q
        }
        return n
    }

    @Test fun tresPalmasAtivam() {
        val a = audio(3000)
        palma(a, 1000); palma(a, 1350); palma(a, 1700)
        assertEquals(1, ativacoes(a))
    }

    @Test fun palmasLentasMasDentroDoLimiteAtivam() {
        val a = audio(4000)
        palma(a, 1000); palma(a, 1700); palma(a, 2400)
        assertEquals(1, ativacoes(a))
    }

    @Test fun duasPalmasNaoAtivam() {
        val a = audio(3000)
        palma(a, 1000); palma(a, 1350)
        assertEquals(0, ativacoes(a))
    }

    @Test fun palmasMuitoEspacadasNaoAtivam() {
        val a = audio(6000)
        palma(a, 1000); palma(a, 2200); palma(a, 3400)
        assertEquals(0, ativacoes(a))
    }

    @Test fun falaNaoAtiva() {
        val a = audio(4000)
        // Três "sílabas" de 250 ms no mesmo ritmo das palmas.
        tom(a, 1000, 250); tom(a, 1400, 250); tom(a, 1800, 250)
        assertEquals(0, ativacoes(a))
    }

    @Test fun palmasFracasAbaixoDoLimiarNaoAtivam() {
        val a = audio(3000)
        palma(a, 1000, 1500); palma(a, 1350, 1500); palma(a, 1700, 1500)
        assertEquals(0, ativacoes(a, DetectorPalmas(taxa, limiarMinimo = 2000.0)))
    }

    @Test fun palmasFracasAtivamComSensibilidadeAlta() {
        val a = audio(3000)
        palma(a, 1000, 4000); palma(a, 1350, 4000); palma(a, 1700, 4000)
        assertEquals(1, ativacoes(a, DetectorPalmas(taxa, limiarMinimo = DetectorPalmas.limiarParaSensibilidade(10))))
    }

    @Test fun seisPalmasAtivamDuasVezesNoMaximo() {
        val a = audio(4000)
        for (k in 0 until 6) palma(a, 1000 + k * 300)
        assertEquals(2, ativacoes(a))
    }

    @Test fun palmasDepoisDeBarulhoLongoAindaFuncionam() {
        val a = audio(8000)
        tom(a, 500, 2500)
        palma(a, 5000); palma(a, 5350); palma(a, 5700)
        assertEquals(1, ativacoes(a))
    }

    @Test fun ambienteBarulhentoConstanteNaoAtiva() {
        val a = audio(5000, ruido = 3000)
        assertEquals(0, ativacoes(a))
    }
}
