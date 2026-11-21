package br.jarvis.core

/**
 * Os limites do controle de tela, decididos pelo código e não pela inteligência: onde o
 * Jarvis nunca toca e quais toques só acontecem depois de um "sim" falado. Assim um texto
 * malicioso que apareça na tela (um comentário, uma mensagem) não consegue passar por cima.
 */
object Limites {
    /** Pedaços do nome técnico de apps de banco, pagamento e carteira mais usados no Brasil. */
    private val pacotesProibidos = listOf(
        "com.nu.production", "com.itau", "br.com.bb.", "com.bradesco", "com.santander", "br.com.gabba.caixa",
        "br.gov.caixa", "br.com.intermedium", "com.c6bank", "com.picpay", "com.mercadopago", "br.com.original",
        "com.paypal", "com.pagseguro", "br.com.uol.ps", "com.neon", "br.com.xp", "com.btg", "com.safra", "com.sicredi",
        "br.com.sicoob", "com.banrisul", "com.next", "br.com.will", "com.willbank", "com.recarga", "com.infinitepay",
        "com.stone", "com.ame", "com.binance", "com.mercadobitcoin", "com.google.android.apps.walletnfcrel",
        "com.google.android.apps.nbu.paisa", "com.samsung.android.spay", "com.iti", "br.com.digio", "com.pan",
    )
    private val palavrasProibidas = listOf("bank", "banco", "wallet", "carteira", "pagamento", "payment", "invest", "corretora", "cripto", "crypto")

    /** O app em primeiro plano é de banco ou pagamento? [pacote] é o nome técnico; [nome], o que aparece na tela. */
    fun appProibido(pacote: String, nome: String): Boolean {
        val p = pacote.lowercase()
        if (pacotesProibidos.any { p.startsWith(it) || p.contains(it) }) return true
        val n = Texto.normalizar(nome)
        return palavrasProibidas.any { p.contains(it) || n.split(" ").any { palavra -> palavra.startsWith(it) } }
    }

    private val verbosSerios = listOf(
        "enviar", "envia", "send", "publicar", "publica", "postar", "post", "compartilhar", "share", "comprar", "compra",
        "buy", "pagar", "pague", "pay", "finalizar", "fechar pedido", "confirmar pedido", "confirmar compra",
        "confirmar pagamento", "assinar", "subscribe", "transferir", "excluir", "apagar", "deletar", "delete", "remover",
        "desinstalar", "uninstall", "bloquear", "denunciar", "sair da conta", "encerrar conta",
    )

    /**
     * Tocar num elemento com este rótulo envia, publica, gasta dinheiro ou apaga algo?
     * Curtir, seguir e rolar ficam de fora: são do dia a dia e fáceis de desfazer.
     * Nesse caso o Jarvis pergunta antes. Rótulo vazio (um ícone sem nome) não entra: a
     * inteligência é instruída a olhar a tela antes de tocar em algo que não sabe o que é.
     */
    fun toqueSerio(rotulo: String): Boolean {
        val r = Texto.normalizar(rotulo)
        if (r.isEmpty()) return false
        val palavras = r.split(" ")
        return verbosSerios.any { verbo ->
            if (verbo.contains(" ")) r.contains(verbo) else palavras.any { it == verbo }
        }
    }
}
