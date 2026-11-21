package br.jarvis.core

/** Um dado que a inteligência precisa informar ao usar uma ferramenta. */
data class Parametro(
    /** Tipo no formato JSON Schema: "string", "integer" ou "boolean". */
    val tipo: String,
    val descricao: String,
    val obrigatorio: Boolean = true,
    /** Valores aceitos, quando a escolha é fechada. */
    val opcoes: List<String>? = null,
)

/** Uma ação que a inteligência pode pedir: ver a agenda, responder uma mensagem, ligar a lanterna. */
class Ferramenta(
    val nome: String,
    val descricao: String,
    val parametros: Map<String, Parametro> = emptyMap(),
    /**
     * Para ações que saem do aparelho em nome da pessoa (enviar uma mensagem): devolve a
     * pergunta que o Jarvis faz em voz alta. A ação só roda depois de um "sim" falado.
     * Devolver `null` significa que, com estes dados, a ação não precisa de confirmação.
     * Quem decide isso é o código, não a inteligência; assim um texto malicioso lido de
     * uma mensagem recebida não consegue enviar nada sozinho.
     */
    val confirmar: ((Argumentos) -> String?)? = null,
    /**
     * Para ferramentas que devolvem uma imagem (foto da câmera, captura da tela) para a
     * inteligência olhar. Quando presente, é usado no lugar de [executar].
     */
    val comImagem: ((Argumentos) -> Saida)? = null,
    /** Executa e devolve, em texto, o resultado que a inteligência vai ler. */
    val executar: (Argumentos) -> String,
)

/** Resultado de uma ferramenta que inclui uma imagem JPEG, em base64. */
class Saida(val texto: String, val jpegBase64: String)

/** Os dados que a inteligência informou para uma ferramenta. */
class Argumentos(private val valores: Map<String, Any?>) {
    fun texto(nome: String): String = valores[nome]?.toString()?.trim() ?: ""

    fun inteiro(nome: String, padrao: Int): Int = when (val v = valores[nome]) {
        is Number -> v.toInt()
        is String -> v.trim().toIntOrNull() ?: padrao
        else -> padrao
    }

    fun logico(nome: String, padrao: Boolean): Boolean = when (val v = valores[nome]) {
        is Boolean -> v
        is String -> v.trim().lowercase() in setOf("true", "sim", "1")
        else -> padrao
    }
}

/** Falha de uma ferramenta, com uma explicação que a inteligência pode repassar à pessoa. */
class FalhaDeFerramenta(mensagem: String) : Exception(mensagem)
