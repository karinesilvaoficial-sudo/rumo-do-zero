package br.jarvis.app

import android.util.Log
import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.errors.AnthropicIoException
import com.anthropic.errors.AnthropicServiceException
import com.anthropic.errors.RateLimitException
import com.anthropic.errors.UnauthorizedException
import com.anthropic.models.messages.ContentBlockParam
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.MessageParam
import com.anthropic.models.messages.OutputConfig
import com.anthropic.models.messages.StopReason
import com.anthropic.models.messages.Tool
import com.anthropic.models.messages.ToolResultBlockParam
import com.anthropic.models.messages.WebSearchTool20260209
import java.text.SimpleDateFormat
import java.time.Duration
import java.util.Date
import java.util.Locale

/**
 * A parte do Jarvis que conversa: manda a fala para o Claude e devolve uma
 * resposta curta, pronta para ser dita em voz alta.
 *
 * O Claude também pode agir no celular: ele recebe a lista de [FERRAMENTAS] e,
 * quando decide usar uma, [agir] é chamado com o nome e os dados; o texto que
 * [agir] devolve volta para o Claude como resultado. Assim frases livres como
 * "põe um alarme pras sete e abre o Spotify" viram ações.
 *
 * Guarda as últimas trocas para a conversa ter continuidade. Deve ser chamado
 * fora da thread principal.
 */
class Cerebro(val chave: String, private val agir: (nome: String, dados: Map<String, Any?>) -> String) {
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
        FERRAMENTAS.forEach { pedido.addTool(it) }
        for ((p, r) in historico) {
            pedido.addUserMessage(p)
            pedido.addAssistantMessage(r)
        }
        pedido.addUserMessage(pergunta)

        return try {
            var voltas = 0
            while (true) {
                val mensagem = cliente.messages().create(pedido.build())
                val motivo = mensagem.stopReason().orElse(null)
                if (motivo == StopReason.REFUSAL) return "Com isso eu não posso ajudar."

                if (motivo == StopReason.TOOL_USE && voltas++ < MAXIMO_DE_VOLTAS) {
                    // Devolve a resposta inteira (sem alterar) e, em seguida, o resultado de cada ação pedida.
                    pedido.addMessage(mensagem)
                    val resultados = mensagem.content().mapNotNull { it.toolUse().orElse(null) }.map { uso ->
                        val dados = try {
                            @Suppress("UNCHECKED_CAST")
                            uso._input().convert(Map::class.java) as? Map<String, Any?> ?: emptyMap()
                        } catch (e: Exception) {
                            emptyMap()
                        }
                        ContentBlockParam.ofToolResult(
                            ToolResultBlockParam.builder().toolUseId(uso.id()).content(agir(uso.name(), dados)).build()
                        )
                    }
                    pedido.addMessage(MessageParam.ofUserOfContentBlockParams(resultados))
                    continue
                }
                if (motivo == StopReason.PAUSE_TURN && voltas++ < MAXIMO_DE_VOLTAS) {
                    // A busca na internet ainda não terminou: reenvia para o Claude continuar de onde parou.
                    pedido.addMessage(mensagem)
                    continue
                }

                val texto = mensagem.content()
                    .mapNotNull { bloco -> bloco.text().orElse(null)?.text() }
                    .joinToString("")
                    .trim()
                if (texto.isEmpty()) return "Feito."
                historico.add(pergunta to texto)
                while (historico.size > MAXIMO_DE_TROCAS) historico.removeAt(0)
                return texto
            }
            @Suppress("UNREACHABLE_CODE")
            ""
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
        private const val MAXIMO_DE_VOLTAS = 6
        private const val PERSONALIDADE =
            "Você é o Jarvis, um assistente pessoal que conversa por voz no celular de quem fala com você. " +
                "Tudo o que você escreve é lido em voz alta, então responda em português do Brasil, em texto corrido, " +
                "sem listas, títulos, símbolos, links ou emojis. Seja direto e cordial: uma a três frases bastam " +
                "na maioria das vezes; alongue só quando a pessoa pedir detalhes. " +
                "A fala da pessoa chega transcrita por reconhecimento de voz e pode ter palavras trocadas; " +
                "interprete pelo sentido mais provável. " +
                "Você pode agir no celular com as ferramentas disponíveis. Quando a pessoa pedir algo que uma " +
                "ferramenta faz, use a ferramenta em vez de explicar como fazer, e depois confirme em uma frase " +
                "curta o que aconteceu, com base no resultado que a ferramenta devolveu. Se o resultado disser " +
                "que falta uma permissão ou que algo não foi encontrado, repasse isso à pessoa. " +
                "Ligações e mensagens vão para outras pessoas: só use essas ferramentas quando a pessoa pedir " +
                "claramente, e escreva a mensagem com as palavras dela."

        private fun texto(descricao: String) = mapOf("type" to "string", "description" to descricao)
        private fun inteiro(descricao: String) = mapOf("type" to "integer", "description" to descricao)

        private fun ferramenta(nome: String, descricao: String, campos: Map<String, Map<String, Any>>): Tool {
            val propriedades = Tool.InputSchema.Properties.builder()
            campos.forEach { (campo, esquema) -> propriedades.putAdditionalProperty(campo, JsonValue.from(esquema)) }
            return Tool.builder()
                .name(nome)
                .description(descricao)
                .inputSchema(
                    Tool.InputSchema.builder()
                        .properties(propriedades.build())
                        .required(campos.keys.toList())
                        .build()
                )
                .build()
        }

        /** O que o Claude pode fazer no celular. Os nomes são tratados em JarvisService.usarFerramenta. */
        val FERRAMENTAS: List<Tool> = listOf(
            ferramenta(
                "abrir_aplicativo", "Abre um aplicativo instalado no celular pelo nome.",
                mapOf("nome" to texto("Nome do aplicativo como aparece no celular, por exemplo YouTube ou Câmera."))
            ),
            ferramenta(
                "tocar_no_youtube", "Abre o YouTube procurando uma música, um vídeo ou um artista.",
                mapOf("termo" to texto("O que procurar."))
            ),
            ferramenta(
                "lanterna", "Liga ou desliga a lanterna do celular.",
                mapOf("ligar" to mapOf("type" to "boolean", "description" to "true para ligar, false para desligar."))
            ),
            ferramenta(
                "volume", "Muda o volume de mídia do celular.",
                mapOf("acao" to mapOf("type" to "string", "enum" to listOf("aumentar", "diminuir", "mudo", "maximo")))
            ),
            ferramenta(
                "temporizador", "Inicia um temporizador (contagem regressiva) no relógio do celular.",
                mapOf("segundos" to inteiro("Duração total em segundos."))
            ),
            ferramenta(
                "alarme", "Cria um alarme no relógio do celular.",
                mapOf("hora" to inteiro("Hora, de 0 a 23."), "minuto" to inteiro("Minuto, de 0 a 59."))
            ),
            ferramenta(
                "ligar", "Faz uma ligação telefônica para um contato da agenda ou para um número.",
                mapOf("contato" to texto("Nome do contato como a pessoa falou, ou o número."))
            ),
            ferramenta(
                "mensagem_whatsapp",
                "Abre a conversa do WhatsApp com um contato, com a mensagem já escrita. A pessoa ainda precisa tocar em enviar.",
                mapOf(
                    "contato" to texto("Nome do contato como a pessoa falou."),
                    "texto" to texto("Texto da mensagem. Vazio para só abrir a conversa."),
                )
            ),
            ferramenta("bateria", "Informa a porcentagem de bateria do celular.", emptyMap()),
        )
    }
}
