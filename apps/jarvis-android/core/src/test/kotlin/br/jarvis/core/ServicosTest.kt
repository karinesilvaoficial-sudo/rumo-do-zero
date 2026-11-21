package br.jarvis.core

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.io.File
import java.net.InetSocketAddress
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Voz (ElevenLabs) e vendas (Cakto) contra um servidor local que imita os dois serviços. */
class ServicosTest {
    private lateinit var servidor: HttpServer
    private val recebidos = ArrayList<String>()
    private var responder: (HttpExchange, String) -> Pair<Int, ByteArray> = { _, _ -> 200 to ByteArray(0) }

    @BeforeTest
    fun subir() {
        servidor = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        servidor.createContext("/") { troca ->
            val corpo = troca.requestBody.readBytes().toString(Charsets.UTF_8)
            synchronized(recebidos) {
                recebidos.add("${troca.requestMethod} ${troca.requestURI} | ${troca.requestHeaders.getFirst("xi-api-key") ?: troca.requestHeaders.getFirst("Authorization") ?: ""} | $corpo")
            }
            val (codigo, saida) = responder(troca, corpo)
            troca.sendResponseHeaders(codigo, if (saida.isEmpty()) -1 else saida.size.toLong())
            if (saida.isNotEmpty()) troca.responseBody.use { it.write(saida) }
            troca.close()
        }
        servidor.start()
    }

    @AfterTest
    fun descer() = servidor.stop(0)

    private val base get() = "http://127.0.0.1:${servidor.address.port}"

    @Test
    fun `voz pede o audio com a chave a voz e o texto`() {
        val audio = byteArrayOf(1, 2, 3, 4)
        responder = { _, _ -> 200 to audio }

        assertContentEquals(audio, VozNatural("chave-eleven", "voz123", base).sintetizar("Sim, mestre?"))

        val pedido = recebidos.single()
        assertContains(pedido, "POST /v1/text-to-speech/voz123?output_format=mp3_44100_128")
        assertContains(pedido, "| chave-eleven |")
        assertContains(pedido, "\"text\":\"Sim, mestre?\"")
        assertContains(pedido, "\"model_id\":\"eleven_flash_v2_5\"")
    }

    @Test
    fun `voz em branco usa a padrao e chave recusada vira falha clara`() {
        responder = { _, _ -> 401 to "{}".toByteArray() }
        val falha = assertFailsWith<FalhaDeServico> { VozNatural("errada", "  ", base).sintetizar("oi") }
        assertEquals("A chave da ElevenLabs não foi aceita.", falha.message)
        assertContains(recebidos.single(), "/v1/text-to-speech/${VozNatural.VOZ_PADRAO}?")
    }

    @Test
    fun `cakto pede o token uma vez e reaproveita`() {
        responder = { troca, _ ->
            if (troca.requestURI.path.endsWith("/token/")) 200 to """{"access_token":"tok-1","expires_in":36000,"token_type":"Bearer"}""".toByteArray()
            else 200 to """{"group_by":"utm_source","results":[],"totals":{"order_count":3,"gross_volume":"291.00","net_value":"270.50","total_discount":"0.00","total_fees":"20.50"}}""".toByteArray()
        }
        val cakto = Cakto("id-1", "segredo-1", base)

        val fala = cakto.vendas("2026-11-20", "2026-11-20")
        cakto.vendas("2026-11-01", "2026-11-20")

        assertEquals("De 2026-11-20 a 2026-11-20: 3 pedidos pagos, valor bruto de R$ 291.00, líquido de R$ 270.50, taxas de R$ 20.50.", fala)
        assertEquals(3, recebidos.size, "um pedido de token e duas consultas")
        assertContains(recebidos[0], "POST /public_api/token/")
        assertContains(recebidos[0], "client_id=id-1&client_secret=segredo-1")
        assertContains(recebidos[1], "GET /public_api/orders/analytics/?start_date=2026-11-20&end_date=2026-11-20&status=paid")
        assertContains(recebidos[1], "| Bearer tok-1 |")
    }

    @Test
    fun `cakto sem vendas e com chaves erradas`() {
        responder = { troca, _ ->
            if (troca.requestURI.path.endsWith("/token/")) 200 to """{"access_token":"t","expires_in":36000}""".toByteArray()
            else 200 to """{"totals":{"order_count":0,"gross_volume":"0","net_value":"0","total_discount":"0","total_fees":"0"}}""".toByteArray()
        }
        assertEquals("Nenhuma venda paga de 2026-11-20 a 2026-11-20.", Cakto("a", "b", base).vendas("2026-11-20", "2026-11-20"))

        responder = { _, _ -> 401 to """{"error":"invalid_client"}""".toByteArray() }
        val falha = assertFailsWith<FalhaDeServico> { Cakto("a", "errado", base).vendas("2026-11-20", "2026-11-20") }
        assertContains(falha.message!!, "não foram aceitas")
    }

    @Test
    fun `cakto pede token novo quando o guardado vence`() {
        var agora = 0L
        var emitidos = 0
        responder = { troca, _ ->
            if (troca.requestURI.path.endsWith("/token/")) 200 to """{"access_token":"tok-${++emitidos}","expires_in":120}""".toByteArray()
            else 200 to """{"totals":{"order_count":1,"gross_volume":"10","net_value":"9","total_discount":"0","total_fees":"1"}}""".toByteArray()
        }
        val cakto = Cakto("a", "b", base) { agora }
        cakto.vendas("2026-11-20", "2026-11-20")
        agora += 30_000
        cakto.vendas("2026-11-20", "2026-11-20")
        assertEquals(1, emitidos)
        agora += 60_000
        cakto.vendas("2026-11-20", "2026-11-20")
        assertEquals(2, emitidos)
    }

    @Test
    fun `diario guarda busca e tem limite`() {
        val arquivo = File.createTempFile("diario", ".txt").also { it.delete(); it.deleteOnExit() }
        val d = Diario(arquivo)
        d.registrar("sex 20/11 21:00", "qual o melhor restaurante\tjaponês daqui", "O Sushi\nBar é bem avaliado.")
        d.registrar("sáb 21/11 09:00", "que horas abre a farmácia", "Às oito.")

        val achadas = Diario(arquivo).buscar("restaurante japones", 5)
        assertEquals(1, achadas.size)
        assertEquals("qual o melhor restaurante japonês daqui", achadas[0].fala)
        assertEquals("O Sushi Bar é bem avaliado.", achadas[0].resposta)
        assertEquals(2, d.buscar("", 10).size)
        assertTrue(d.buscar("cachorro", 10).isEmpty())
        assertContains(d.ferramenta().executar(Argumentos(mapOf("busca" to "farmácia"))), "Às oito.")

        repeat(Diario.MAXIMO_DE_TROCAS + 10) { d.registrar("dia", "fala $it", "resposta") }
        assertEquals(Diario.MAXIMO_DE_TROCAS, d.buscar("", 10_000).size)
    }

    @Test
    fun `lembretes criam listam em ordem e removem`() {
        val arquivo = File.createTempFile("lembretes", ".txt").also { it.delete(); it.deleteOnExit() }
        val l = Lembretes(arquivo)
        val remedio = l.criar(2000, "tomar o remédio")
        val reuniao = l.criar(1000, "reunião\tcom a Ana")

        assertEquals(listOf("reunião com a Ana", "tomar o remédio"), Lembretes(arquivo).listar().map { it.texto })
        assertEquals(remedio, l.achar("remedio"))
        assertEquals(reuniao, l.remover(reuniao.id))
        assertNull(l.remover(reuniao.id))
        // Um id nunca é reaproveitado enquanto houver pendentes: o alarme antigo não dispara o lembrete novo.
        assertEquals(remedio.id + 1, l.criar(3000, "outro").id)
    }

    @Test
    fun `bateria avisa uma vez em cada marca`() {
        val v = VigiaDaBateria()
        assertNull(v.avaliar(60, false))
        assertEquals("Mestre, a bateria está em 20 por cento.", v.avaliar(20, false))
        assertNull(v.avaliar(19, false))
        assertNull(v.avaliar(15, false))
        assertContains(v.avaliar(10, false)!!, "Recomendo carregar")
        assertNull(v.avaliar(8, false))
        // Na tomada: silêncio até completar, e um aviso só.
        assertNull(v.avaliar(9, true))
        assertNull(v.avaliar(99, true))
        assertEquals("Mestre, a bateria está completamente carregada.", v.avaliar(100, true))
        assertNull(v.avaliar(100, true))
        // Descarregou de novo: os avisos voltam a valer.
        assertNull(v.avaliar(90, false))
        assertEquals("Mestre, a bateria está em 18 por cento.", v.avaliar(18, false))
    }
}
