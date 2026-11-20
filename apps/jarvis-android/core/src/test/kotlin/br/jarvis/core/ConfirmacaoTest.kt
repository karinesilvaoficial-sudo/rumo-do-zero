package br.jarvis.core

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ConfirmacaoTest {
    @Test
    fun `aceites comuns`() {
        for (fala in listOf("sim", "Sim!", "pode mandar", "pode", "confirma", "isso mesmo", "manda", "ok", "claro", "pode enviar sim"))
            assertTrue(Confirmacao.afirmativa(fala), fala)
    }

    @Test
    fun `recusas e mudancas nao enviam`() {
        for (fala in listOf("não", "nao manda", "cancela", "espera", "não, muda para amanhã", "sim, mas troca o horário", "deixa pra lá", "para"))
            assertFalse(Confirmacao.afirmativa(fala), fala)
    }

    @Test
    fun `na duvida nao envia`() {
        for (fala in listOf("", "que horas são", "hum", "talvez", "o que você disse?"))
            assertFalse(Confirmacao.afirmativa(fala), fala)
        // Uma frase longa não é uma confirmação, mesmo contendo "sim".
        assertFalse(Confirmacao.afirmativa("sim eu acho que a gente podia falar com ela amanhã de manhã sobre isso"))
    }
}
