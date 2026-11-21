package br.jarvis.core

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Testa o agente contra um servidor local que imita a API, com respostas combinadas. */
class AgenteTest {
    private lateinit var servidor: HttpServer
    private val respostas = ConcurrentLinkedQueue<String>()
    private val pedidos = ArrayList<String>()
    private val enviadas = ArrayList<String>()
    private var agora = 1_000_000L

    @BeforeTest
    fun subir() {
        servidor = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        servidor.createContext("/") { troca ->
            synchronized(pedidos) { pedidos.add(troca.requestBody.readBytes().toString(Charsets.UTF_8)) }
            val corpo = (respostas.poll() ?: """{"type":"error","error":{"type":"api_error","message":"sem resposta combinada"}}""")
                .toByteArray()
            // Pedidos em fluxo recebem a resposta combinada no formato de eventos.
            troca.responseHeaders.add("content-type", if (String(corpo).startsWith("event:")) "text/event-stream" else "application/json")
            troca.sendResponseHeaders(if (String(corpo).startsWith("{\"type\":\"error\"")) 500 else 200, corpo.size.toLong())
            troca.responseBody.use { it.write(corpo) }
        }
        servidor.start()
    }

    @AfterTest
    fun descer() = servidor.stop(0)

    private fun mensagem(parada: String, vararg blocos: String) =
        """{"id":"msg_1","type":"message","role":"assistant","model":"claude-haiku-5-5","content":[${blocos.joinToString(",")}],""" +
            """"stop_reason":"$parada","stop_sequence":null,"usage":{"input_tokens":10,"output_tokens":5}}"""

    private fun texto(t: String) = """{"type":"text","text":"$t"}"""
    private fun uso(id: String, nome: String, entrada: String) = """{"type":"tool_use","id":"$id","name":"$nome","input":$entrada}"""
    private val raciocinio = """{"type":"thinking","thinking":"","signature":"assinatura-abc"}"""

    private fun agente(): Agente {
        val agenda = Ferramenta(
            nome = "agenda_ver",
            descricao = "Lista os compromissos.",
            parametros = mapOf("dias" to Parametro("integer", "Quantos dias à frente.", obrigatorio = false)),
        ) { a -> "Dentista às 15h (dias=${a.inteiro("dias", 1)})" }
        val responder = Ferramenta(
            nome = "whatsapp_responder",
            descricao = "Responde uma conversa.",
            parametros = mapOf(
                "conversa" to Parametro("string", "Nome da conversa."),
                "texto" to Parametro("string", "Texto a enviar."),
            ),
            confirmar = { a -> "Vou responder ${a.texto("conversa")}: ${a.texto("texto")}. Posso enviar?" },
        ) { a ->
            enviadas.add(a.texto("conversa") + "|" + a.texto("texto"))
            "Enviado."
        }
        val quebrada = Ferramenta("quebrada", "Sempre falha.") { throw FalhaDeFerramenta("Sem acesso à agenda.") }
        return Agente(
            chave = "chave-de-teste",
            ferramentas = listOf(agenda, responder, quebrada),
            instrucoes = { "Você é o Jarvis." },
            enderecoDaApi = "http://127.0.0.1:${servidor.address.port}",
            relogio = { agora },
        )
    }

    @Test
    fun `resposta simples vira fala e entra no historico`() {
        respostas.add(mensagem("end_turn", texto("Tudo certo.")))
        respostas.add(mensagem("end_turn", texto("De nada.")))
        val a = agente()

        assertEquals("Tudo certo.", a.ouvir("tudo bem?"))
        assertEquals("De nada.", a.ouvir("obrigado"))

        // O segundo pedido leva a troca anterior junto.
        assertContains(pedidos[1], "tudo bem?")
        assertContains(pedidos[1], "Tudo certo.")
        // E todo pedido declara o modelo, as ferramentas e a rede de segurança contra recusas.
        assertContains(pedidos[0], "\"model\":\"claude-haiku-5-5\"")
        assertContains(pedidos[0], "\"name\":\"agenda_ver\"")
        // O Haiku não tem reserva contra recusas: mandar o parâmetro seria rejeitado.
        assertFalse(pedidos[0].contains("fallbacks"))
        assertContains(pedidos[0], "web_search_20250305")
        assertContains(pedidos[0], "\"effort\":\"low\"")
    }

    @Test
    fun `executa a ferramenta pedida e devolve o resultado ao modelo`() {
        respostas.add(mensagem("tool_use", raciocinio, uso("toolu_1", "agenda_ver", """{"dias":2}""")))
        respostas.add(mensagem("end_turn", texto("Você tem dentista às três da tarde.")))
        val a = agente()

        assertEquals("Você tem dentista às três da tarde.", a.ouvir("o que tenho amanhã?"))

        assertEquals(2, pedidos.size)
        val segundo = pedidos[1]
        assertContains(segundo, "\"tool_use_id\":\"toolu_1\"")
        assertContains(segundo, "Dentista às 15h (dias=2)")
        // O raciocínio do modelo volta intacto, como a API exige.
        assertContains(segundo, "assinatura-abc")
    }

    @Test
    fun `falha de ferramenta volta como erro e a conversa continua`() {
        respostas.add(mensagem("tool_use", uso("toolu_1", "quebrada", "{}"), uso("toolu_2", "inexistente", "{}")))
        respostas.add(mensagem("end_turn", texto("Não tenho acesso à agenda.")))
        val a = agente()

        assertEquals("Não tenho acesso à agenda.", a.ouvir("veja a agenda"))
        assertContains(pedidos[1], "Sem acesso à agenda.")
        assertContains(pedidos[1], "\"is_error\":true")
        assertContains(pedidos[1], "\"tool_use_id\":\"toolu_2\"")
    }

    @Test
    fun `envio so acontece depois do sim`() {
        respostas.add(mensagem("tool_use", uso("toolu_9", "whatsapp_responder", """{"conversa":"Ana","texto":"Chego às 8"}""")))
        respostas.add(mensagem("end_turn", texto("Enviei para a Ana.")))
        val a = agente()

        val pergunta = a.ouvir("responde a Ana que chego às 8")
        assertEquals("Vou responder Ana: Chego às 8. Posso enviar?", pergunta)
        assertTrue(a.aguardandoConfirmacao)
        assertTrue(enviadas.isEmpty(), "nada pode sair antes da confirmação")
        assertEquals(1, pedidos.size)

        assertEquals("Enviei para a Ana.", a.ouvir("sim, pode mandar"))
        assertEquals(listOf("Ana|Chego às 8"), enviadas)
        assertFalse(a.aguardandoConfirmacao)
        assertContains(pedidos[1], "\"tool_use_id\":\"toolu_9\"")
        assertContains(pedidos[1], "Enviado.")
    }

    @Test
    fun `sem o sim nada e enviado e o modelo recebe a resposta da pessoa`() {
        respostas.add(mensagem("tool_use", uso("toolu_9", "whatsapp_responder", """{"conversa":"Ana","texto":"Chego às 8"}""")))
        respostas.add(mensagem("end_turn", texto("Certo, não enviei.")))
        val a = agente()

        a.ouvir("responde a Ana que chego às 8")
        assertEquals("Certo, não enviei.", a.ouvir("não, deixa pra lá"))

        assertTrue(enviadas.isEmpty())
        assertFalse(a.aguardandoConfirmacao)
        assertContains(pedidos[1], "não confirmou")
        assertContains(pedidos[1], "deixa pra lá")
        assertContains(pedidos[1], "\"is_error\":true")
    }

    @Test
    fun `confirmacao vence e um sim tardio nao envia nada`() {
        respostas.add(mensagem("tool_use", uso("toolu_9", "whatsapp_responder", """{"conversa":"Ana","texto":"Chego às 8"}""")))
        respostas.add(mensagem("end_turn", texto("Sim o quê?")))
        val a = agente()

        a.ouvir("responde a Ana que chego às 8")
        agora += 5 * 60_000
        assertFalse(a.aguardandoConfirmacao)
        assertEquals("Sim o quê?", a.ouvir("sim"))

        assertTrue(enviadas.isEmpty())
        // A fala tardia começa um pedido novo, sem resultado de ferramenta.
        assertFalse(pedidos[1].contains("tool_use_id"))
    }

    @Test
    fun `dois envios na mesma resposta - so um fica para confirmar`() {
        respostas.add(
            mensagem(
                "tool_use",
                uso("toolu_1", "agenda_ver", "{}"),
                uso("toolu_2", "whatsapp_responder", """{"conversa":"Ana","texto":"Oi"}"""),
                uso("toolu_3", "whatsapp_responder", """{"conversa":"Beto","texto":"Oi"}"""),
            )
        )
        respostas.add(mensagem("end_turn", texto("Enviei para a Ana. Quer que eu envie para o Beto?")))
        val a = agente()

        assertEquals("Vou responder Ana: Oi. Posso enviar?", a.ouvir("manda oi pra Ana e pro Beto"))
        a.ouvir("pode")

        assertEquals(listOf("Ana|Oi"), enviadas)
        // Os três pedidos de ferramenta recebem resultado na mesma mensagem.
        for (id in listOf("toolu_1", "toolu_2", "toolu_3")) assertContains(pedidos[1], "\"tool_use_id\":\"$id\"")
        assertContains(pedidos[1], "uma ação por vez")
    }

    @Test
    fun `recusa do modelo vira uma fala e nao trava a conversa`() {
        respostas.add(mensagem("refusal"))
        respostas.add(mensagem("end_turn", texto("Olá.")))
        val a = agente()

        assertEquals("Com isso eu não posso ajudar.", a.ouvir("pedido recusado"))
        assertEquals("Olá.", a.ouvir("oi"))
        assertFalse(pedidos[1].contains("pedido recusado"), "o pedido recusado não deve voltar no histórico")
    }

    @Test
    fun `erro da api vira uma fala clara`() {
        // Sem resposta combinada, o servidor devolve erro 500 (o cliente tenta duas vezes).
        val fala = agente().ouvir("oi")
        assertEquals("A inteligência recusou o pedido. Confira se a conta da chave tem créditos.", fala)
    }

    @Test
    fun `sem servidor a fala e de falta de conexao e o motivo fica registrado`() {
        val registros = ArrayList<String>()
        servidor.stop(0)
        val a = Agente("chave", emptyList(), { "x" }, { m, _ -> registros.add(m) }, "http://127.0.0.1:${servidor.address.port}")

        assertEquals("Estou sem conexão com a internet.", a.ouvir("oi"))
        assertTrue(registros.single().startsWith("Falha de rede: "), registros.toString())
        assertContains(registros.single(), "ConnectException")
    }

    @Test
    fun `ferramenta com imagem manda a imagem ao modelo e a conversa e guardada ao concluir`() {
        respostas.add(mensagem("tool_use", uso("toolu_1", "ver_pela_camera", "{}")))
        respostas.add(mensagem("end_turn", texto("É uma caneca azul.")))
        val guardadas = ArrayList<String>()
        val camera = Ferramenta("ver_pela_camera", "Tira uma foto.", comImagem = { Saida("Foto tirada agora.", "QUJD") }) { "" }
        val a = Agente(
            "chave", listOf(camera), { "x" }, enderecoDaApi = "http://127.0.0.1:${servidor.address.port}",
            aoConcluir = { fala, resposta -> guardadas.add("$fala -> $resposta") },
        )

        assertEquals("É uma caneca azul.", a.ouvir("o que é isso?"))

        assertContains(pedidos[1], "\"type\":\"image\"")
        assertContains(pedidos[1], "\"media_type\":\"image/jpeg\"")
        assertContains(pedidos[1], "\"data\":\"QUJD\"")
        assertContains(pedidos[1], "Foto tirada agora.")
        assertEquals(listOf("o que é isso? -> É uma caneca azul."), guardadas)
    }

    @Test
    fun `confirmacao depende dos dados - toque comum roda direto e toque serio pergunta`() {
        val tocados = ArrayList<String>()
        val tocar = Ferramenta(
            "tela_tocar", "Toca.", mapOf("rotulo" to Parametro("string", "Rótulo.")),
            confirmar = { a -> if (Limites.toqueSerio(a.texto("rotulo"))) "Vou tocar em ${a.texto("rotulo")}. Posso?" else null },
        ) { a -> tocados.add(a.texto("rotulo")); "Tocado." }
        respostas.add(mensagem("tool_use", uso("t1", "tela_tocar", """{"rotulo":"Pesquisar"}""")))
        respostas.add(mensagem("tool_use", uso("t2", "tela_tocar", """{"rotulo":"Enviar"}""")))
        respostas.add(mensagem("end_turn", texto("Enviado.")))
        val a = Agente("chave", listOf(tocar), { "x" }, enderecoDaApi = "http://127.0.0.1:${servidor.address.port}")

        assertEquals("Vou tocar em Enviar. Posso?", a.ouvir("manda"))
        assertEquals(listOf("Pesquisar"), tocados)
        assertEquals("Enviado.", a.ouvir("sim"))
        assertEquals(listOf("Pesquisar", "Enviar"), tocados)
    }

    @Test
    fun `tarefa longa para quando a pessoa interrompe`() {
        repeat(10) { respostas.add(mensagem("tool_use", uso("toolu_$it", "agenda_ver", "{}"))) }
        var parar = false
        val agenda = Ferramenta("agenda_ver", "Lista.") { parar = true; "ok" }
        val a = Agente("chave", listOf(agenda), { "x" }, enderecoDaApi = "http://127.0.0.1:${servidor.address.port}", interrompido = { parar })

        assertEquals("Interrompido, mestre.", a.ouvir("faça uma tarefa longa"))
        assertEquals(1, pedidos.size, "depois do primeiro passo ele não chama mais o modelo")
    }

    @Test
    fun `gasto e contado a cada resposta e o limite barra o pedido seguinte`() {
        respostas.add(mensagem("end_turn", texto("Olá.")))
        var entrada = 0L
        var saida = 0L
        var liberado = true
        val a = Agente(
            "chave", emptyList(), { "x" }, enderecoDaApi = "http://127.0.0.1:${servidor.address.port}",
            aoGastar = { e, s -> entrada += e; saida += s }, podeGastar = { liberado },
        )

        assertEquals("Olá.", a.ouvir("oi"))
        assertEquals(10L, entrada)
        assertEquals(5L, saida)

        liberado = false
        assertContains(a.ouvir("oi de novo"), "limite de gasto de hoje")
        assertEquals(1, pedidos.size, "com o limite atingido, nada é enviado ao modelo")
    }

    @Test
    fun `conversa de antes volta como contexto depois de reiniciar`() {
        respostas.add(mensagem("end_turn", texto("Às nove.")))
        val a = Agente(
            "chave", emptyList(), { "x" }, enderecoDaApi = "http://127.0.0.1:${servidor.address.port}",
            historicoInicial = listOf("que horas abre a farmácia" to "Às oito."),
        )
        assertEquals("Às nove.", a.ouvir("e a padaria?"))
        assertContains(pedidos[0], "que horas abre a farmácia")
        assertContains(pedidos[0], "Às oito.")
    }

    private fun evento(tipo: String, dados: String) = "event: $tipo\ndata: $dados\n\n"

    /** Uma resposta em fluxo, com o texto chegando em [pedacos]. */
    private fun fluxo(vararg pedacos: String) = buildString {
        append(evento("message_start", """{"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-haiku-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":7,"output_tokens":1}}}"""))
        append(evento("content_block_start", """{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}"""))
        for (p in pedacos) append(evento("content_block_delta", """{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"$p"}}"""))
        append(evento("content_block_stop", """{"type":"content_block_stop","index":0}"""))
        append(evento("message_delta", """{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":9}}"""))
        append(evento("message_stop", """{"type":"message_stop"}"""))
    }

    @Test
    fun `em fluxo as frases sao entregues uma a uma e a resposta inteira e devolvida`() {
        respostas.add(fluxo("Bom dia, mes", "tre. Hoje há dois compro", "missos. O primeiro é às nove."))
        val faladas = ArrayList<String>()
        val a = agente()

        val completa = a.ouvir("bom dia") { faladas.add(it) }

        assertEquals(listOf("Bom dia, mestre.", "Hoje há dois compromissos.", "O primeiro é às nove."), faladas)
        assertEquals("Bom dia, mestre. Hoje há dois compromissos. O primeiro é às nove.", completa)
        assertTrue(a.jaFalou)
        assertContains(pedidos[0], "\"stream\":true")
    }

    @Test
    fun `fala que vem do codigo nao conta como ja falada`() {
        respostas.add(buildString {
            append(evento("message_start", """{"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","model":"claude-haiku-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":7,"output_tokens":1}}}"""))
            append(evento("content_block_start", """{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_9","name":"whatsapp_responder","input":{}}}"""))
            append(evento("content_block_delta", """{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"conversa\":\"Ana\","}}"""))
            append(evento("content_block_delta", """{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\"texto\":\"Oi\"}"}}"""))
            append(evento("content_block_stop", """{"type":"content_block_stop","index":0}"""))
            append(evento("message_delta", """{"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":9}}"""))
            append(evento("message_stop", """{"type":"message_stop"}"""))
        })
        val a = agente()
        // A pergunta de confirmação é montada pelo aplicativo, não pelo modelo: quem chama precisa falar.
        assertEquals("Vou responder Ana: Oi. Posso enviar?", a.ouvir("responde a Ana com oi") { })
        assertFalse(a.jaFalou)
    }

    @Test
    fun `laco de ferramentas tem limite`() {
        repeat(40) { respostas.add(mensagem("tool_use", uso("toolu_$it", "agenda_ver", "{}"))) }
        val fala = agente().ouvir("fique em laço")
        assertEquals("Não consegui concluir isso agora. Tente pedir de outro jeito.", fala)
        assertEquals(24, pedidos.size)
    }
}
