package br.jarvis.core

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class FalaTest {
    @Test
    fun `divide em trechos com a primeira frase sozinha`() {
        val trechos = Fala.dividir("Bom dia, mestre. Hoje há dois compromissos. O primeiro é às nove. O segundo é às três da tarde!")
        assertEquals("Bom dia, mestre.", trechos.first())
        assertEquals("Bom dia, mestre. Hoje há dois compromissos. O primeiro é às nove. O segundo é às três da tarde!", trechos.joinToString(" "))
        assertEquals(listOf("Sim, mestre?"), Fala.dividir("  Sim, mestre?  "))
        assertTrue(Fala.dividir("").isEmpty())
        // Frases longas não são juntadas além do tamanho alvo.
        val longas = Fala.dividir("Oi. " + "palavra ".repeat(30).trim() + ". " + "outra ".repeat(30).trim() + ".")
        assertEquals(3, longas.size)
    }

    @Test
    fun `wav tem cabecalho e tamanho certos`() {
        val wav = Fala.wav(shortArrayOf(1, -1, 256, 0), 3, 16000)
        assertEquals(44 + 6, wav.size)
        assertEquals("RIFF", String(wav, 0, 4))
        assertEquals("WAVEfmt ", String(wav, 8, 8))
        assertEquals("data", String(wav, 36, 4))
        // 16000 Hz em little-endian, e a terceira amostra (256) como 00 01.
        assertEquals(listOf(0x80, 0x3E, 0, 0), wav.slice(24..27).map { it.toInt() and 0xFF })
        assertEquals(listOf(0, 1), wav.slice(48..49).map { it.toInt() and 0xFF })
    }

    private val bloco = 1600 // 100 ms a 16 kHz
    private fun som(volume: Int) = ShortArray(bloco) { if (it % 2 == 0) volume.toShort() else (-volume).toShort() }

    private fun rodar(captura: CapturaDeFala, vararg blocos: Pair<Int, Int>): CapturaDeFala.Estado {
        var estado = CapturaDeFala.Estado.OUVINDO
        for ((volume, vezes) in blocos) repeat(vezes) {
            if (estado == CapturaDeFala.Estado.OUVINDO) estado = captura.alimentar(som(volume), bloco)
        }
        return estado
    }

    @Test
    fun `comando dito logo depois do nome e recortado ate o silencio`() {
        val c = CapturaDeFala()
        c.comecarCom(som(3000), bloco)
        assertEquals(CapturaDeFala.Estado.CONCLUIDA, rodar(c, 3000 to 12, 50 to 9))
        // Pré-áudio, 1,2 s de fala e o silêncio até decidir que acabou.
        assertEquals(bloco * (1 + 12 + 8), c.quantidade)
    }

    @Test
    fun `so silencio depois do nome volta ao fluxo normal rapido`() {
        val c = CapturaDeFala()
        assertEquals(CapturaDeFala.Estado.SEM_FALA, rodar(c, 50 to 20))
        assertTrue(c.quantidade <= bloco * 10, "não pode ficar segundos esperando por nada")
    }

    @Test
    fun `um estalo curto nao conta como fala e fala longa tem teto`() {
        assertEquals(CapturaDeFala.Estado.SEM_FALA, rodar(CapturaDeFala(), 3000 to 2, 50 to 20))
        assertEquals(CapturaDeFala.Estado.CONCLUIDA, rodar(CapturaDeFala(duracaoMaximaMs = 2000), 3000 to 40))
    }

    @Test
    fun `gasto soma no dia zera no dia seguinte e respeita o limite`() {
        var dia = "2026-11-21"
        val arquivo = File.createTempFile("gasto", ".txt").also { it.delete(); it.deleteOnExit() }
        val g = Gasto(arquivo, { dia })
        assertEquals(0.0, g.deHoje())
        g.registrar(1_000_000, 0)
        g.registrar(0, 1_000_000)
        assertEquals(0.60, Gasto(arquivo, { dia }).deHoje(), 1e-9)
        assertTrue(g.dentroDoLimite(1.0))
        assertFalse(g.dentroDoLimite(0.5))
        assertTrue(g.dentroDoLimite(0.0), "zero significa sem limite")
        dia = "2026-11-22"
        assertEquals(0.0, g.deHoje())
        assertTrue(g.dentroDoLimite(0.5))
    }

    @Test
    fun `frases saem inteiras mesmo chegando aos pedacos`() {
        val saidas = ArrayList<String>()
        val f = Frases { saidas.add(it) }
        for (p in listOf("Olá, mes", "tre! Tudo ", "certo por aqui. O Sr. Silva li", "gou")) f.receber(p)
        assertEquals(listOf("Olá, mestre!", "Tudo certo por aqui."), saidas)
        f.fim()
        assertEquals("O Sr. Silva ligou", saidas.last())
        f.fim()
        assertEquals(3, saidas.size)
    }
}
