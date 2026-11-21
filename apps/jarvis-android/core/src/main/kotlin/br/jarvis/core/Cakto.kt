package br.jarvis.core

import com.fasterxml.jackson.databind.ObjectMapper
import java.net.URLEncoder

/** Consulta as vendas da pessoa na Cakto, com as chaves de API que ela criou no painel. */
class Cakto(
    private val idDoCliente: String,
    private val segredo: String,
    private val enderecoBase: String = "https://api.cakto.com.br",
    private val relogio: () -> Long = System::currentTimeMillis,
) {
    private val json = ObjectMapper()
    private var token: String? = null
    private var tokenValeAte = 0L

    /** Totais dos pedidos pagos entre [inicio] e [fim] (datas AAAA-MM-DD, inclusive), em texto. */
    @Synchronized
    fun vendas(inicio: String, fim: String): String {
        val consulta = "start_date=${codificar(inicio)}&end_date=${codificar(fim)}&status=paid"
        var resposta = buscar(consulta)
        if (resposta.codigo == 401) {
            // O token guardado pode ter sido revogado: pede outro uma vez.
            token = null
            resposta = buscar(consulta)
        }
        if (resposta.codigo == 403)
            throw FalhaDeServico("A chave da Cakto não tem permissão para ver pedidos. Crie uma chave com os escopos de leitura e pedidos.", 403)
        if (resposta.codigo !in 200..299)
            throw FalhaDeServico("A Cakto respondeu ${resposta.codigo}: ${resposta.texto.take(200)}", resposta.codigo)

        val totais = json.readTree(resposta.texto).path("totals")
        val pedidos = totais.path("order_count").asInt(0)
        if (pedidos == 0) return "Nenhuma venda paga de $inicio a $fim."
        return "De $inicio a $fim: $pedidos pedidos pagos, valor bruto de R$ ${totais.path("gross_volume").asText("0")}, " +
            "líquido de R$ ${totais.path("net_value").asText("0")}, taxas de R$ ${totais.path("total_fees").asText("0")}."
    }

    private fun buscar(consulta: String): Rede.Resposta = try {
        Rede.chamar(
            "GET", "$enderecoBase/public_api/orders/analytics/?$consulta",
            mapOf("Authorization" to "Bearer ${obterToken()}", "Accept" to "application/json"),
        )
    } catch (e: java.io.IOException) {
        throw FalhaDeServico("Sem conexão com a Cakto.")
    }

    /** O token vale por horas; pedir um a cada consulta esbarra no limite da Cakto. */
    private fun obterToken(): String {
        token?.let { if (relogio() < tokenValeAte) return it }
        val corpo = "client_id=${codificar(idDoCliente)}&client_secret=${codificar(segredo)}".toByteArray()
        val resposta = Rede.chamar(
            "POST", "$enderecoBase/public_api/token/",
            mapOf("Content-Type" to "application/x-www-form-urlencoded", "Accept" to "application/json"), corpo,
        )
        if (resposta.codigo == 401 || resposta.codigo == 400)
            throw FalhaDeServico("As chaves da Cakto não foram aceitas. Confira o client id e o client secret na tela do Jarvis.", resposta.codigo)
        if (resposta.codigo !in 200..299) throw FalhaDeServico("A Cakto respondeu ${resposta.codigo} ao pedir acesso.", resposta.codigo)
        val dados = json.readTree(resposta.texto)
        val novo = dados.path("access_token").asText("")
        if (novo.isEmpty()) throw FalhaDeServico("A Cakto não devolveu o acesso.")
        token = novo
        // Um minuto de folga para não usar um token no último instante de validade.
        tokenValeAte = relogio() + (dados.path("expires_in").asLong(3600) - 60) * 1000
        return novo
    }

    private fun codificar(valor: String) = URLEncoder.encode(valor, "UTF-8")
}
