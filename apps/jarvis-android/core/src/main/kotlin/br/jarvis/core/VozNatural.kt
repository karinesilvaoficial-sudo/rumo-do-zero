package br.jarvis.core

import com.fasterxml.jackson.databind.ObjectMapper

/** Transforma texto em fala com a ElevenLabs. Devolve o áudio em MP3. */
class VozNatural(
    private val chave: String,
    private val idDaVoz: String = VOZ_PADRAO,
    private val enderecoBase: String = "https://api.elevenlabs.io",
) {
    fun sintetizar(texto: String): ByteArray {
        val corpo = ObjectMapper().writeValueAsBytes(
            mapOf(
                "text" to texto,
                // Modelo rápido e multilíngue: numa conversa falada, a demora pesa mais que o último grau de naturalidade.
                "model_id" to "eleven_flash_v2_5",
                "language_code" to "pt",
            )
        )
        val resposta = try {
            Rede.chamar(
                "POST",
                "$enderecoBase/v1/text-to-speech/${idDaVoz.ifBlank { VOZ_PADRAO }}?output_format=mp3_44100_128",
                mapOf("xi-api-key" to chave, "Content-Type" to "application/json", "Accept" to "audio/mpeg"),
                corpo,
            )
        } catch (e: java.io.IOException) {
            throw FalhaDeServico("Sem conexão com a ElevenLabs.")
        }
        if (resposta.codigo == 401) throw FalhaDeServico("A chave da ElevenLabs não foi aceita.", 401)
        if (resposta.codigo !in 200..299)
            throw FalhaDeServico("A ElevenLabs respondeu ${resposta.codigo}: ${resposta.texto.take(200)}", resposta.codigo)
        if (resposta.corpo.isEmpty()) throw FalhaDeServico("A ElevenLabs devolveu um áudio vazio.")
        return resposta.corpo
    }

    companion object {
        /** "George", voz masculina grave da biblioteca padrão da ElevenLabs. */
        const val VOZ_PADRAO = "JBFqnCBsd6RMkjVDRZzb"
    }
}
