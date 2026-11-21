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
        if (resposta.codigo !in 200..299) throw explicar(resposta, "falar")
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
        if (resposta.codigo !in 200..299) throw explicar(resposta, "listar as vozes")
        return ObjectMapper().readTree(resposta.texto).path("voices").map { voz ->
            val rotulos = voz.path("labels")
            val detalhes = listOf("gender", "accent", "age", "language", "descriptive")
                .map { rotulos.path(it).asText("") }.filter { it.isNotEmpty() }
            Voz(voz.path("voice_id").asText(""), voz.path("name").asText("(sem nome)"), detalhes.joinToString(", "))
        }.filter { it.id.isNotEmpty() }
    }

    /** Transforma em texto o que a pessoa falou ([wav] é um arquivo WAV inteiro). */
    fun transcrever(wav: ByteArray): String {
        val fronteira = "jarvis" + System.nanoTime()
        val corpo = java.io.ByteArrayOutputStream()
        fun campo(nome: String, valor: String) = corpo.write(
            "--$fronteira\r\nContent-Disposition: form-data; name=\"$nome\"\r\n\r\n$valor\r\n".toByteArray()
        )
        campo("model_id", "scribe_v1")
        campo("language_code", "pt")
        corpo.write("--$fronteira\r\nContent-Disposition: form-data; name=\"file\"; filename=\"fala.wav\"\r\nContent-Type: audio/wav\r\n\r\n".toByteArray())
        corpo.write(wav)
        corpo.write("\r\n--$fronteira--\r\n".toByteArray())
        val resposta = try {
            Rede.chamar(
                "POST", "$enderecoBase/v1/speech-to-text",
                mapOf("xi-api-key" to chave, "Content-Type" to "multipart/form-data; boundary=$fronteira", "Accept" to "application/json"),
                corpo.toByteArray(), tempoLimiteMs = 20_000,
            )
        } catch (e: java.io.IOException) {
            throw FalhaDeServico("Sem conexão com a ElevenLabs.")
        }
        if (resposta.codigo !in 200..299) throw explicar(resposta, "transcrever")
        return ObjectMapper().readTree(resposta.texto).path("text").asText("").trim()
    }

    /**
     * Transforma a recusa da ElevenLabs numa explicação que diz o que fazer. "Chave recusada" pode
     * ser chave errada, chave sem a permissão necessária, créditos esgotados ou voz paga num plano grátis.
     */
    private fun explicar(resposta: Rede.Resposta, acao: String): FalhaDeServico {
        val detalhe = runCatching { ObjectMapper().readTree(resposta.texto).path("detail") }.getOrNull()
        val estado = detalhe?.path("status")?.asText("").orEmpty()
        val mensagem = (detalhe?.path("message")?.asText("") ?: "").ifEmpty { detalhe?.asText("").orEmpty() }
        val texto = when {
            estado == "missing_permissions" || mensagem.contains("missing the permission") -> {
                val qual = Regex("permission ([a-z_]+)").find(mensagem)?.groupValues?.get(1)
                "A chave da ElevenLabs não tem permissão para $acao" + (if (qual != null) " ($qual)" else "") +
                    ". No site da ElevenLabs, edite a chave e libere Text to Speech, Speech to Text e Voices (leitura), ou crie uma chave sem restrições."
            }
            estado == "invalid_api_key" -> "A ElevenLabs não reconheceu a chave. Copie a chave inteira de novo (ela começa com sk_) e salve."
            estado == "quota_exceeded" -> "Os créditos da ElevenLabs acabaram neste mês."
            resposta.codigo == 402 || estado.contains("payment") || estado.contains("free_users") ->
                "Essa voz exige um plano pago da ElevenLabs. Escolha outra voz da lista."
            estado == "voice_not_found" || resposta.codigo == 404 -> "A voz escolhida não existe na sua conta. Escolha outra na lista."
            resposta.codigo == 401 -> "A chave da ElevenLabs não foi aceita" + (if (mensagem.isNotEmpty()) ": $mensagem" else ".")
            else -> "A ElevenLabs respondeu ${resposta.codigo} ao $acao" + (if (mensagem.isNotEmpty()) ": ${mensagem.take(160)}" else ".")
        }
        return FalhaDeServico(texto, resposta.codigo)
    }

    companion object {
        /** Tira espaços e quebras de linha que entram ao copiar e colar. */
        fun limparChave(colada: String): String = colada.filterNot { it.isWhitespace() || it == '\u200B' }

        /** Entre as vozes da conta, a primeira marcada como brasileira ou em português. */
        fun vozBrasileira(vozes: List<Voz>): Voz? {
            fun tem(voz: Voz, vararg termos: String) = termos.any { Texto.normalizar(voz.descricao + " " + voz.nome).contains(it) }
            return vozes.firstOrNull { tem(it, "brazil", "brasil") } ?: vozes.firstOrNull { tem(it, "portugu", " pt") }
        }

        /** "George", voz masculina grave da biblioteca padrão da ElevenLabs. */
        const val VOZ_PADRAO = "JBFqnCBsd6RMkjVDRZzb"
    }
}
