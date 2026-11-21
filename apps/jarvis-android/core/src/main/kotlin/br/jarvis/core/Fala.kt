package br.jarvis.core

import java.io.ByteArrayOutputStream

/** Apoio para falar e ouvir: dividir a resposta em trechos e recortar o comando dito logo depois do nome. */
object Fala {
    /**
     * Divide a resposta em trechos de uma ou mais frases. Assim a voz começa a tocar o primeiro
     * trecho enquanto os seguintes ainda estão sendo gerados, em vez de esperar o texto inteiro.
     */
    fun dividir(texto: String, tamanhoAlvo: Int = 160): List<String> {
        val frases = Regex("(?<=[.!?…])\\s+").split(texto.trim()).map { it.trim() }.filter { it.isNotEmpty() }
        val trechos = ArrayList<String>()
        val atual = StringBuilder()
        for (frase in frases) {
            // A primeira frase vai sozinha, para a fala começar o quanto antes.
            if (atual.isNotEmpty() && (trechos.isEmpty() || atual.length + frase.length > tamanhoAlvo)) {
                trechos.add(atual.toString())
                atual.setLength(0)
            }
            if (atual.isNotEmpty()) atual.append(' ')
            atual.append(frase)
        }
        if (atual.isNotEmpty()) trechos.add(atual.toString())
        return trechos
    }

    /** Embala áudio cru (16 bits, mono) num arquivo WAV, o formato que o serviço de transcrição aceita. */
    fun wav(amostras: ShortArray, quantidade: Int, taxa: Int): ByteArray {
        val dados = quantidade * 2
        val saida = ByteArrayOutputStream(44 + dados)
        fun texto(t: String) = saida.write(t.toByteArray(Charsets.US_ASCII))
        fun int32(v: Int) { for (i in 0 until 4) saida.write(v shr (8 * i) and 0xFF) }
        fun int16(v: Int) { for (i in 0 until 2) saida.write(v shr (8 * i) and 0xFF) }
        texto("RIFF"); int32(36 + dados); texto("WAVE")
        texto("fmt "); int32(16); int16(1); int16(1); int32(taxa); int32(taxa * 2); int16(2); int16(16)
        texto("data"); int32(dados)
        for (i in 0 until quantidade) int16(amostras[i].toInt())
        return saida.toByteArray()
    }
}

/**
 * Recorta o que a pessoa diz logo depois de "Jarvis", para o comando poder vir na mesma frase
 * ("Jarvis, abre o YouTube"). Recebe o áudio em blocos; termina quando a pessoa para de falar,
 * ou logo, se depois do nome veio só silêncio.
 */
class CapturaDeFala(
    private val taxa: Int = 16000,
    /** Volume (RMS) acima do qual o bloco conta como fala. */
    private val limiarDeFala: Double = 900.0,
    private val esperaPorFalaMs: Int = 900,
    private val silencioFinalMs: Int = 800,
    private val duracaoMaximaMs: Int = 12_000,
) {
    enum class Estado { OUVINDO, SEM_FALA, CONCLUIDA }

    private var amostras = ShortArray(taxa * 4)
    var quantidade = 0
        private set
    private var decorridoMs = 0
    private var silencioMs = 0
    private var falouMs = 0

    /** O áudio recortado até agora. Válido quando [alimentar] devolve [Estado.CONCLUIDA]. */
    fun audio(): ShortArray = amostras

    /** Áudio de antes da detecção do nome: o começo do comando costuma estar nele. */
    fun comecarCom(bloco: ShortArray, lidas: Int) = guardar(bloco, lidas)

    fun alimentar(bloco: ShortArray, lidas: Int): Estado {
        guardar(bloco, lidas)
        var soma = 0.0
        for (i in 0 until lidas) soma += bloco[i].toDouble() * bloco[i]
        val rms = if (lidas == 0) 0.0 else Math.sqrt(soma / lidas)
        val ms = lidas * 1000 / taxa
        decorridoMs += ms
        if (rms >= limiarDeFala) {
            falouMs += ms
            silencioMs = 0
        } else silencioMs += ms

        return when {
            // Falou de verdade (não só um estalo) e depois se calou: é o fim do comando.
            falouMs >= 300 && silencioMs >= silencioFinalMs -> Estado.CONCLUIDA
            falouMs < 300 && decorridoMs >= esperaPorFalaMs && silencioMs >= esperaPorFalaMs / 2 -> Estado.SEM_FALA
            decorridoMs >= duracaoMaximaMs -> if (falouMs >= 300) Estado.CONCLUIDA else Estado.SEM_FALA
            else -> Estado.OUVINDO
        }
    }

    private fun guardar(bloco: ShortArray, lidas: Int) {
        if (quantidade + lidas > amostras.size) amostras = amostras.copyOf(maxOf(amostras.size * 2, quantidade + lidas))
        System.arraycopy(bloco, 0, amostras, quantidade, lidas)
        quantidade += lidas
    }
}
