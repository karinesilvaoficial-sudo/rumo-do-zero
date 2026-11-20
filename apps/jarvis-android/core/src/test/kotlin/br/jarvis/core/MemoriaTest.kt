package br.jarvis.core

import java.io.File
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MemoriaTest {
    private fun nova() = Memoria(File.createTempFile("memoria", ".txt").also { it.delete(); it.deleteOnExit() })

    @Test
    fun `guarda lista e sobrevive a reabrir`() {
        val arquivo = File.createTempFile("memoria", ".txt").also { it.deleteOnExit() }
        val m = Memoria(arquivo)
        assertTrue(m.lembrar("A irmã se chama Ana."))
        assertTrue(m.lembrar("Prefere  respostas   curtas."))
        assertEquals(listOf("A irmã se chama Ana.", "Prefere respostas curtas."), Memoria(arquivo).listar())
    }

    @Test
    fun `nao repete o mesmo fato`() {
        val m = nova()
        assertTrue(m.lembrar("Mora em Recife"))
        assertFalse(m.lembrar("mora em recife."))
        assertFalse(m.lembrar("   "))
        assertEquals(1, m.listar().size)
    }

    @Test
    fun `esquece pelo trecho`() {
        val m = nova()
        m.lembrar("A irmã se chama Ana.")
        m.lembrar("O dentista é o doutor Paulo.")
        assertEquals(1, m.esquecer("irmã"))
        assertEquals(0, m.esquecer("cachorro"))
        assertEquals(listOf("O dentista é o doutor Paulo."), m.listar())
    }

    @Test
    fun `tem limite de fatos e de tamanho`() {
        val m = nova()
        repeat(Memoria.MAXIMO_DE_FATOS + 5) { m.lembrar("fato número $it") }
        assertEquals(Memoria.MAXIMO_DE_FATOS, m.listar().size)
        assertEquals("fato número 5", m.listar().first())
        m.lembrar("x".repeat(1000))
        assertEquals(Memoria.TAMANHO_MAXIMO, m.listar().last().length)
    }

    @Test
    fun `ferramentas de memoria funcionam`() {
        val m = nova()
        val (lembrar, esquecer) = m.ferramentas()
        assertEquals("Guardado.", lembrar.executar(Argumentos(mapOf("fato" to "Gosta de café"))))
        assertEquals("Isso já estava guardado.", lembrar.executar(Argumentos(mapOf("fato" to "Gosta de café"))))
        assertEquals("Apaguei 1 fato.", esquecer.executar(Argumentos(mapOf("trecho" to "café"))))
        assertTrue(m.listar().isEmpty())
    }

    @Test
    fun `instrucoes incluem data situacao e memoria`() {
        val texto = Instrucoes.montar("sexta, 20 de novembro, 22:00", listOf("Bateria em 80 por cento."), listOf("Mora em Recife"))
        assertContains(texto, "Agora é sexta, 20 de novembro, 22:00.")
        assertContains(texto, "Bateria em 80 por cento.")
        assertContains(texto, "- Mora em Recife")
        assertFalse(Instrucoes.montar("hoje", emptyList(), emptyList()).contains("O que você já sabe"))
    }
}
