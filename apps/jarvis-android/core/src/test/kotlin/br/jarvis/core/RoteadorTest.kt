package br.jarvis.core

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RoteadorTest {
    private fun vai(fala: String, comIa: Boolean = true) =
        Roteador.paraAInteligencia(fala, Interpretador.interpretar(fala), comIa)

    @Test
    fun `comandos simples e curtos ficam no aparelho`() {
        for (fala in listOf("que horas são", "que dia é hoje", "como está a bateria", "ligar a lanterna", "abrir youtube", "timer de 5 minutos", "ligar para 99999 1234"))
            assertFalse(vai(fala), fala)
    }

    @Test
    fun `pedidos que so parecem comandos vao para a inteligencia`() {
        for (fala in listOf(
            "que horas é minha reunião de amanhã",
            "que dia eu tenho consulta com o dentista",
            "tem alguma mensagem falando da bateria do carro",
            "ligar para a Maria",
            "o que tenho na agenda hoje",
            "responde a Ana que eu chego às oito",
        )) assertTrue(vai(fala), fala)
    }

    @Test
    fun `sem inteligencia tudo fica no aparelho`() {
        assertFalse(vai("que horas é minha reunião de amanhã", comIa = false))
        assertFalse(vai("o que tenho na agenda hoje", comIa = false))
    }
}
