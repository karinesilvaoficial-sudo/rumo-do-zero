package br.jarvis.app

import android.content.Context
import android.util.Log
import br.jarvis.core.Agente
import br.jarvis.core.Diario
import br.jarvis.core.Gasto
import br.jarvis.core.Instrucoes
import br.jarvis.core.Memoria
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * A parte do Jarvis que pensa: junta a inteligência (o agente, em `core`) com o que ela
 * pode fazer neste celular. Deve ser chamado fora da thread principal.
 */
class Cerebro(
    contexto: Context,
    val chave: String,
    executor: Executor,
    /** A pessoa disse "Jarvis" no meio de uma tarefa: é para parar. */
    interrompido: () -> Boolean = { false },
) {
    private val memoria = Memoria(File(contexto.applicationContext.filesDir, "memoria.txt"))
    private val preferencias = Preferencias(contexto.applicationContext)
    private val gasto = gastoDe(contexto)
    private val diario = Diario(File(contexto.applicationContext.filesDir, "diario.txt"))
    private val aparelho = FerramentasDoAparelho(contexto.applicationContext, executor)

    private val agente = Agente(
        chave = chave,
        ferramentas = aparelho.todas() + memoria.ferramentas() + diario.ferramenta(),
        instrucoes = {
            val agora = SimpleDateFormat("EEEE, d 'de' MMMM 'de' yyyy, HH:mm", Locale("pt", "BR")).format(Date())
            Instrucoes.montar(agora, aparelho.situacao(), memoria.listar())
        },
        aoConcluir = { fala, resposta ->
            diario.registrar(SimpleDateFormat("EEE d/MM/yyyy HH:mm", Locale("pt", "BR")).format(Date()), fala, resposta)
        },
        interrompido = interrompido,
        // As últimas conversas, guardadas no aparelho, voltam como contexto quando o Jarvis é reaberto.
        historicoInicial = diario.buscar("", 6).map { it.fala to it.resposta },
        aoGastar = { entrada, saida -> gasto.registrar(entrada, saida) },
        podeGastar = { gasto.dentroDoLimite(preferencias.limiteDiario.toDouble()) },
        registrar = { mensagem, erro ->
            Log.e("Jarvis", mensagem, erro)
            // Aparece na tela: sem isso, só daria para saber o motivo ligando o celular a um computador.
            Estado.mudar { aviso = mensagem.take(300) }
        },
    )

    /** O Jarvis perguntou "posso enviar?" e espera a resposta: a próxima fala deve vir para cá. */
    val aguardandoConfirmacao: Boolean get() = agente.aguardandoConfirmacao

    companion object {
        /** A conta do dia, compartilhada entre a inteligência e a tela. */
        fun gastoDe(contexto: Context) = Gasto(File(contexto.applicationContext.filesDir, "gasto.txt"), {
            SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
        })

        fun diarioDe(contexto: Context) = Diario(File(contexto.applicationContext.filesDir, "diario.txt"))
    }

    /** Devolve o que o Jarvis deve falar em resposta. */
    fun perguntar(pergunta: String): String = try {
        agente.ouvir(pergunta)
    } finally {
        // A tarefa acabou (ou parou para perguntar algo): o aviso de "Jarvis está mexendo na tela" some.
        ControleDeTela.instancia?.esconderBolha()
    }
}
