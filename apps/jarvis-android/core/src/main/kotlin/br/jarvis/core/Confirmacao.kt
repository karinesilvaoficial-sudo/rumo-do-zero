package br.jarvis.core

/** Entende se a pessoa disse "sim" quando o Jarvis pediu confirmação. */
object Confirmacao {
    private val recusas = setOf(
        "nao", "nem", "cancela", "cancelar", "cancele", "espera", "espere", "pera", "para", "pare",
        "errado", "errada", "muda", "mude", "troca", "troque", "corrige", "corrija", "esquece", "deixa",
    )
    private val aceites = setOf(
        "sim", "pode", "confirma", "confirmo", "confirmado", "manda", "mande", "envia", "envie",
        "isso", "claro", "ok", "okay", "certo", "positivo", "beleza", "bora", "vai", "exato", "perfeito",
    )

    /** Só é "sim" quando há uma palavra de aceite e nenhuma de recusa: na dúvida, não envia. */
    fun afirmativa(fala: String): Boolean {
        val palavras = Texto.normalizar(fala).split(" ").filter { it.isNotEmpty() }
        if (palavras.isEmpty() || palavras.size > 8) return false
        if (palavras.any { it in recusas }) return false
        return palavras.any { it in aceites }
    }
}
