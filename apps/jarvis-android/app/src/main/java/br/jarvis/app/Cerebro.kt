package br.jarvis.app

import android.util.Log
import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.errors.AnthropicIoException
import com.anthropic.errors.AnthropicServiceException
import com.anthropic.errors.RateLimitException
import com.anthropic.errors.UnauthorizedException
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.OutputConfig
import com.anthropic.models.messages.StopReason
import com.anthropic.models.messages.WebSearchTool20260209
import java.text.SimpleDateFormat
import java.time.Duration
import java.util.Date
import java.util.Locale

/**
 * A parte do Jarvis que conversa: manda a pergunta para o Claude e devolve
 * uma resposta curta, pronta para ser falada. Guarda as últimas trocas para
 * a conversa ter continuidade. Deve ser chamado fora da thread principal.
 */
class Cerebro(val chave: String) {
    private val cliente: AnthropicClient = AnthropicOkHttpClient.builder()
        .apiKey(chave)
        .timeout(Duration.ofSeconds(60))
        .maxRetries(1)
        .build()

    private val historico = ArrayList<Pair<String, String>>()

    fun perguntar(pergunta: String): String {
        val agora = SimpleDateFormat("EEEE, d 'de' MMMM 'de' yyyy, HH:mm", Locale("pt", "BR")).format(Date())
        val pedido = MessageCreateParams.builder()
            .model("claude-opus-5-5")
            .maxTokens(4000L)
            .system("$PERSONALIDADE\nAgora é $agora.")
            // Esforço baixo: numa conversa falada, responder rápido importa mais que raciocinar longamente.
            .outputConfig(OutputConfig.builder().effort(OutputConfig.Effort.LOW).build())
            // Permite buscar na internet o que muda com o tempo (clima, notícias, resultados).
            .addTool(WebSearchTool20260209.builder().maxUses(3L).build())
        for ((p, r) in historico) {
            pedido.addUserMessage(p)
            pedido.addAssistantMessage(r)
        }
        pedido.addUserMessage(pergunta)

        return try {
            val mensagem = cliente.messages().create(pedido.build())
            if (mensagem.stopReason().orElse(null) == StopReason.REFUSAL) {
                return "Com isso eu não posso ajudar."
            }
            val texto = mensagem.content()
                .mapNotNull { bloco -> bloco.text().orElse(null)?.text() }
                .joinToString("")
                .trim()
            if (texto.isEmpty()) return "Não consegui formular uma resposta."
            historico.add(pergunta to texto)
            while (historico.size > MAXIMO_DE_TROCAS) historico.removeAt(0)
            texto
        } catch (e: UnauthorizedException) {
            "A chave da inteligência não foi aceita. Confira a chave na tela do Jarvis."
        } catch (e: RateLimitException) {
            "A inteligência está no limite de uso agora. Tente de novo em instantes."
        } catch (e: AnthropicServiceException) {
            Log.e(TAG, "Erro da API (${e.statusCode()})", e)
            "A inteligência recusou o pedido. Confira se a conta da chave tem créditos."
        } catch (e: AnthropicIoException) {
            "Estou sem conexão com a internet."
        } catch (e: Exception) {
            Log.e(TAG, "Falha ao perguntar", e)
            "Tive um problema para responder agora."
        }
    }

    companion object {
        private const val TAG = "Jarvis"
        private const val MAXIMO_DE_TROCAS = 8
        private const val PERSONALIDADE =
            "Você é o Jarvis, um assistente pessoal que conversa por voz no celular de quem fala com você. " +
                "Tudo o que você escreve é lido em voz alta, então responda em português do Brasil, em texto corrido, " +
                "sem listas, títulos, símbolos, links ou emojis. Seja direto e cordial: uma a três frases bastam " +
                "na maioria das vezes; alongue só quando a pessoa pedir detalhes. " +
                "A fala da pessoa chega transcrita por reconhecimento de voz e pode ter palavras trocadas; " +
                "interprete pelo sentido mais provável. " +
                "Abrir aplicativos, lanterna, volume, alarmes e temporizadores são feitos por outra parte do app " +
                "quando a pessoa pede com essas palavras; se ela pedir algo assim e chegar até você, diga como pedir " +
                "(por exemplo: abrir e o nome do aplicativo)."
    }
}
