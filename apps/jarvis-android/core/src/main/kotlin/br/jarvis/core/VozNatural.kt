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
                // O modelo de maior qualidade em português: soa mais natural que o rápido, ao custo de cerca de um segundo.
                "model_id" to "eleven_multilingual_v2",
                // Estável o bastante para não oscilar entre frases, com um pouco de expressão para não soar lido.
                "voice_settings" to mapOf("stability" to 0.5, "similarity_boost" to 0.8, "style" to 0.2, "use_speaker_boost" to true),
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

    /** Uma voz disponível na conta da pessoa. */
    class Voz(val id: String, val nome: String, val descricao: String)

    /** As vozes da conta (as padrão e as que a pessoa adicionou da biblioteca), para ela escolher. */
    fun listarVozes(): List<Voz> {
        val resposta = try {
            Rede.chamar("GET", "$enderecoBase/v1/voices", mapOf("xi-api-key" to chave, "Accept" to "application/json"))
        } catch (e: java.io.IOException) {
            throw FalhaDeServico("Sem conexão com a ElevenLabs.")
        }
        if (resposta.codigo == 401) throw FalhaDeServico("A chave da ElevenLabs não foi aceita.", 401)
        if (resposta.codigo !in 200..299) throw FalhaDeServico("A ElevenLabs respondeu ${resposta.codigo}.", resposta.codigo)
        return ObjectMapper().readTree(resposta.texto).path("voices").map { voz ->
            val rotulos = voz.path("labels")
            val detalhes = listOf("gender", "accent", "age", "language", "descriptive")
                .map { rotulos.path(it).asText("") }.filter { it.isNotEmpty() }
            Voz(voz.path("voice_id").asText(""), voz.path("name").asText("(sem nome)"), detalhes.joinToString(", "))
        }.filter { it.id.isNotEmpty() }
    }

    companion object {
        /** "George", voz masculina grave da biblioteca padrão da ElevenLabs. */
        const val VOZ_PADRAO = "JBFqnCBsd6RMkjVDRZzb"
    }
}
