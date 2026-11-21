package br.jarvis.core

import java.net.HttpURLConnection
import java.net.URL

/** Uma chamada a um serviço externo não deu certo; a mensagem pode ser dita à pessoa. */
class FalhaDeServico(mensagem: String, val codigo: Int = 0) : Exception(mensagem)

/** Chamadas HTTP simples, usadas para a voz (ElevenLabs) e as vendas (Cakto). */
internal object Rede {
    class Resposta(val codigo: Int, val corpo: ByteArray) {
        val texto: String get() = corpo.toString(Charsets.UTF_8)
    }

    fun chamar(
        metodo: String,
        endereco: String,
        cabecalhos: Map<String, String>,
        corpo: ByteArray? = null,
        tempoLimiteMs: Int = 30_000,
    ): Resposta {
        val conexao = URL(endereco).openConnection() as HttpURLConnection
        try {
            conexao.requestMethod = metodo
            conexao.connectTimeout = 15_000
            conexao.readTimeout = tempoLimiteMs
            for ((nome, valor) in cabecalhos) conexao.setRequestProperty(nome, valor)
            if (corpo != null) {
                conexao.doOutput = true
                conexao.outputStream.use { it.write(corpo) }
            }
            val codigo = conexao.responseCode
            val fluxo = if (codigo in 200..299) conexao.inputStream else conexao.errorStream
            return Resposta(codigo, fluxo?.use { it.readBytes() } ?: ByteArray(0))
        } finally {
            conexao.disconnect()
        }
    }
}
