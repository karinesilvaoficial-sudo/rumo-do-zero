package br.jarvis.core

import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.errors.AnthropicIoException
import com.anthropic.errors.AnthropicServiceException
import com.anthropic.errors.RateLimitException
import com.anthropic.errors.UnauthorizedException
import com.anthropic.models.beta.messages.BetaBase64ImageSource
import com.anthropic.models.beta.messages.BetaContentBlockParam
import com.anthropic.models.beta.messages.BetaMessageParam
import com.anthropic.models.beta.messages.BetaOutputConfig
import com.anthropic.models.beta.messages.BetaStopReason
import com.anthropic.models.beta.messages.BetaTool
import com.anthropic.models.beta.messages.BetaToolResultBlockParam
import com.anthropic.models.beta.messages.BetaWebSearchTool20250305
import com.anthropic.models.beta.messages.MessageCreateParams
import com.fasterxml.jackson.core.type.TypeReference
import java.time.Duration

/**
 * O agente: recebe o que a pessoa falou, conversa com o Claude e executa as ferramentas
 * que ele pedir, até ter uma resposta para falar em voz alta.
 *
 * Ferramentas com confirmação (enviar mensagem) não rodam na hora: [ouvir] devolve a
 * pergunta de confirmação e a ação fica pendente até a próxima fala.
 *
 * Deve ser chamado fora da thread principal; cada chamada pode levar vários segundos.
 */
class Agente(
    chave: String,
    private val ferramentas: List<Ferramenta>,
    /** Monta as instruções do sistema. Chamado uma vez por pedido da pessoa. */
    private val instrucoes: () -> String,
    private val registrar: (mensagem: String, erro: Throwable?) -> Unit = { _, _ -> },
    /** Só para testes: endereço de um servidor que imita a API. */
    enderecoDaApi: String? = null,
    private val relogio: () -> Long = System::currentTimeMillis,
    /** Chamado ao fim de cada pedido atendido, com o que a pessoa disse e o que o Jarvis respondeu. */
    private val aoConcluir: (fala: String, resposta: String) -> Unit = { _, _ -> },
    /** A pessoa mandou parar? Consultado entre um passo e outro de uma tarefa longa. */
    private val interrompido: () -> Boolean = { false },
    /** Chamado a cada resposta do modelo, com os tokens cobrados. */
    private val aoGastar: (tokensDeEntrada: Long, tokensDeSaida: Long) -> Unit = { _, _ -> },
    /** Ainda há saldo no limite diário que a pessoa definiu? */
    private val podeGastar: () -> Boolean = { true },
) {
    private val cliente: AnthropicClient = AnthropicOkHttpClient.builder()
        .apiKey(chave)
        // Com raciocínio, ferramentas e busca na internet, uma resposta pode passar de um minuto.
        .timeout(Duration.ofSeconds(120))
        .maxRetries(1)
        .apply { if (enderecoDaApi != null) baseUrl(enderecoDaApi) }
        .build()

    private val porNome = ferramentas.associateBy { it.nome }
    private val definicoes = ferramentas.map(::definir)

    /** Trocas anteriores (o que a pessoa disse, o que o Jarvis respondeu), só em texto. */
    private val historico = ArrayList<Pair<String, String>>()

    // Estado do pedido em andamento. As instruções e as mensagens não mudam no meio de um
    // pedido: o modelo exige receber de volta, intacto, tudo o que veio antes do raciocínio dele.
    private var sistema = ""
    private var falaDoPedido = ""
    private val mensagens = ArrayList<BetaMessageParam>()

    private class LimiteAtingido : Exception()

    private class Pendencia(
        val idDoPedido: String,
        val ferramenta: Ferramenta,
        val argumentos: Argumentos,
        /** Resultados das outras ferramentas pedidas na mesma resposta, já executadas. */
        val prontos: List<BetaContentBlockParam>,
        val desde: Long,
        val pergunta: String,
    )

    @Volatile
    private var pendencia: Pendencia? = null

    /**
     * Há uma ação esperando o "sim" da pessoa? Nesse caso a próxima fala deve vir direto para cá.
     * A espera vence em dois minutos: um "sim" dito mais tarde, em outro assunto, não envia nada.
     */
    val aguardandoConfirmacao: Boolean
        get() = pendencia?.let { relogio() - it.desde <= VALIDADE_DA_CONFIRMACAO_MS } ?: false

    /** Recebe uma fala da pessoa e devolve o que o Jarvis deve dizer. */
    @Synchronized
    fun ouvir(fala: String): String = try {
        if (!podeGastar()) throw LimiteAtingido()
        val p = pendencia.takeIf { aguardandoConfirmacao }
        if (p != null) {
            pendencia = null
            mensagens.add(BetaMessageParam.ofUserOfContentBlockParams(p.prontos + resolver(p, fala)))
        } else {
            pendencia = null
            sistema = instrucoes()
            falaDoPedido = fala
            mensagens.clear()
            for ((dito, respondido) in historico) {
                mensagens.add(BetaMessageParam.ofUser(dito))
                mensagens.add(BetaMessageParam.ofAssistant(respondido))
            }
            mensagens.add(BetaMessageParam.ofUser(fala))
        }
        rodar()
    } catch (e: LimiteAtingido) {
        abandonar("Mestre, o limite de gasto de hoje com a inteligência foi atingido. Ele pode ser aumentado na tela do Jarvis.")
    } catch (e: UnauthorizedException) {
        abandonar("A chave da inteligência não foi aceita. Confira a chave na tela do Jarvis.")
    } catch (e: RateLimitException) {
        abandonar("A inteligência está no limite de uso agora. Tente de novo em instantes.")
    } catch (e: AnthropicServiceException) {
        registrar("Erro da API (${e.statusCode()}): ${e.message ?: ""}", e)
        abandonar("A inteligência recusou o pedido. Confira se a conta da chave tem créditos.")
    } catch (e: AnthropicIoException) {
        registrar("Falha de rede: " + descrever(e), e)
        abandonar(falaParaFalhaDeRede(e))
    } catch (e: Exception) {
        registrar("Falha ao responder: " + descrever(e), e)
        abandonar("Tive um problema para responder agora.")
    }

    /** Conversa com o modelo e executa ferramentas até sair uma resposta ou uma pergunta de confirmação. */
    private fun rodar(): String {
        repeat(MAXIMO_DE_PASSOS) {
            if (interrompido()) return abandonar("Interrompido, mestre.")
            val resposta = cliente.beta().messages().create(montarPedido())
            runCatching { aoGastar(resposta.usage().inputTokens(), resposta.usage().outputTokens()) }
            val parada = resposta.stopReason().orElse(null)
            if (parada == BetaStopReason.REFUSAL) return abandonar("Com isso eu não posso ajudar.")

            mensagens.add(resposta.toParam())
            // A busca na internet roda no servidor e pode pausar no meio: basta pedir que continue.
            if (parada == BetaStopReason.PAUSE_TURN) return@repeat

            val texto = resposta.content()
                .mapNotNull { bloco -> bloco.text().orElse(null)?.text() }
                .joinToString("")
                .trim()
            val pedidos = resposta.content().mapNotNull { it.toolUse().orElse(null) }
            if (pedidos.isEmpty() || parada == BetaStopReason.MAX_TOKENS) {
                if (texto.isEmpty()) return abandonar("Não consegui formular uma resposta.")
                historico.add(falaDoPedido to texto)
                try {
                    aoConcluir(falaDoPedido, texto)
                } catch (e: Exception) {
                    registrar("Falha ao guardar a conversa", e)
                }
                while (historico.size > MAXIMO_DE_TROCAS) historico.removeAt(0)
                mensagens.clear()
                return texto
            }

            val prontos = ArrayList<BetaContentBlockParam>()
            var aConfirmar: Pendencia? = null
            for (pedido in pedidos) {
                val ferramenta = porNome[pedido.name()]
                val argumentos = Argumentos(lerArgumentos(pedido._input()))
                // A pergunta de confirmação depende dos dados: tocar em "Enviar" pede, tocar em "Buscar" não.
                val pergunta = if (ferramenta == null) null else try {
                    ferramenta.confirmar?.invoke(argumentos)
                } catch (e: Exception) {
                    null
                }
                when {
                    ferramenta == null ->
                        prontos.add(resultado(pedido.id(), "Essa ferramenta não existe.", erro = true))
                    pergunta == null ->
                        prontos.add(executar(pedido.id(), ferramenta, argumentos))
                    aConfirmar == null ->
                        aConfirmar = Pendencia(pedido.id(), ferramenta, argumentos, prontos, relogio(), pergunta)
                    else -> prontos.add(
                        resultado(
                            pedido.id(),
                            "Só dá para confirmar uma ação por vez. Peça esta de novo depois que a anterior for resolvida.",
                            erro = true,
                        )
                    )
                }
            }
            val espera = aConfirmar
            if (espera != null) {
                pendencia = espera
                return espera.pergunta
            }
            mensagens.add(BetaMessageParam.ofUserOfContentBlockParams(prontos))
        }
        return abandonar("Não consegui concluir isso agora. Tente pedir de outro jeito.")
    }

    /** O resultado da ação pendente, conforme a pessoa confirmou ou não. */
    private fun resolver(p: Pendencia, fala: String): BetaContentBlockParam =
        if (Confirmacao.afirmativa(fala)) executar(p.idDoPedido, p.ferramenta, p.argumentos)
        else resultado(
            p.idDoPedido,
            "A pessoa não confirmou e a ação não foi feita. A resposta dela foi: \"$fala\". " +
                "Se ela pediu uma mudança, chame a ferramenta de novo já com a mudança; se desistiu, apenas confirme que não fez.",
            erro = true,
        )

    private fun executar(id: String, ferramenta: Ferramenta, argumentos: Argumentos): BetaContentBlockParam = try {
        val comImagem = ferramenta.comImagem
        if (comImagem != null) resultadoComImagem(id, comImagem(argumentos))
        else resultado(id, ferramenta.executar(argumentos).ifBlank { "Feito." }, erro = false)
    } catch (e: FalhaDeFerramenta) {
        resultado(id, e.message ?: "Não deu certo.", erro = true)
    } catch (e: Exception) {
        registrar("Falha na ferramenta ${ferramenta.nome}", e)
        resultado(id, "A ferramenta falhou: ${e.javaClass.simpleName}.", erro = true)
    }

    private fun resultado(id: String, texto: String, erro: Boolean): BetaContentBlockParam =
        BetaContentBlockParam.ofToolResult(
            BetaToolResultBlockParam.builder().toolUseId(id).content(texto).isError(erro).build()
        )

    /** "Sem internet" só quando é isso mesmo: demora e falha de segurança têm outra causa e outro conserto. */
    private fun falaParaFalhaDeRede(e: Throwable): String {
        val causas = generateSequence(e) { it.cause }.take(8).toList()
        return when {
            causas.any { it is java.net.UnknownHostException || it is java.net.ConnectException || it is java.net.NoRouteToHostException } ->
                "Estou sem conexão com a internet."
            causas.any { it is javax.net.ssl.SSLException } ->
                "A conexão segura com a inteligência falhou. Confira a data e a hora do celular e a rede em uso."
            causas.any { it is java.net.SocketTimeoutException || it is java.io.InterruptedIOException } ->
                "A inteligência demorou demais para responder. Tente de novo."
            else -> "Não consegui falar com a inteligência. O motivo está na tela do Jarvis."
        }
    }

    private fun descrever(e: Throwable): String =
        generateSequence(e) { it.cause }.take(4).joinToString(" <- ") { it.javaClass.simpleName + ": " + (it.message ?: "") }

    private fun resultadoComImagem(id: String, saida: Saida): BetaContentBlockParam =
        BetaContentBlockParam.ofToolResult(
            BetaToolResultBlockParam.builder()
                .toolUseId(id)
                .contentOfBlocks(
                    listOf(
                        BetaToolResultBlockParam.Content.Block.ofText(saida.texto),
                        BetaToolResultBlockParam.Content.Block.ofImage(
                            BetaBase64ImageSource.builder()
                                .data(saida.jpegBase64)
                                .mediaType(BetaBase64ImageSource.MediaType.IMAGE_JPEG)
                                .build()
                        ),
                    )
                )
                .build()
        )

    private fun abandonar(fala: String): String {
        pendencia = null
        mensagens.clear()
        return fala
    }

    private fun montarPedido(): MessageCreateParams {
        val pedido = MessageCreateParams.builder()
            .model(MODELO)
            .maxTokens(16000L)
            .system(sistema)
            // Esforço baixo: numa conversa falada, responder rápido importa mais que raciocinar longamente.
            .outputConfig(BetaOutputConfig.builder().effort(BetaOutputConfig.Effort.LOW).build())
            // Busca na internet para o que muda com o tempo (clima, notícias, resultados).
            .addTool(BetaWebSearchTool20250305.builder().maxUses(3L).build())
        for (definicao in definicoes) pedido.addTool(definicao)
        pedido.messages(mensagens)
        return pedido.build()
    }

    private fun definir(f: Ferramenta): BetaTool {
        val propriedades = BetaTool.InputSchema.Properties.builder()
        for ((nome, p) in f.parametros) {
            val esquema = LinkedHashMap<String, Any>()
            esquema["type"] = p.tipo
            esquema["description"] = p.descricao
            if (p.opcoes != null) esquema["enum"] = p.opcoes
            propriedades.putAdditionalProperty(nome, JsonValue.from(esquema))
        }
        return BetaTool.builder()
            .name(f.nome)
            .description(f.descricao)
            .inputSchema(
                BetaTool.InputSchema.builder()
                    .properties(propriedades.build())
                    .required(f.parametros.filter { it.value.obrigatorio }.keys.toList())
                    .build()
            )
            .build()
    }

    private fun lerArgumentos(entrada: JsonValue): Map<String, Any?> = try {
        entrada.convert(object : TypeReference<Map<String, Any?>>() {}) ?: emptyMap()
    } catch (e: Exception) {
        emptyMap()
    }

    companion object {
        /** O modelo mais rápido e barato da família: numa conversa falada, a espera pesa mais que o último grau de raciocínio. */
        const val MODELO = "claude-haiku-5-5"
        private const val MAXIMO_DE_TROCAS = 8
        /** Idas e vindas com o modelo num mesmo pedido, para um engano não virar um laço sem fim. */
        private const val MAXIMO_DE_PASSOS = 24
        private const val VALIDADE_DA_CONFIRMACAO_MS = 120_000L
    }
}
