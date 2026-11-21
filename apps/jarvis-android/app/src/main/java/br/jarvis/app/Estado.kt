package br.jarvis.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import java.util.concurrent.CopyOnWriteArrayList

enum class Fase { PARADO, CARREGANDO, AGUARDANDO, OUVINDO, PENSANDO, FALANDO }

/** Situação atual do Jarvis, compartilhada entre o serviço e a tela. */
object Estado {
    @Volatile var fase = Fase.PARADO
    @Volatile var ouvido = ""
    @Volatile var resposta = ""
    @Volatile var aviso = ""
    /** Volume do que o microfone está ouvindo agora, de 0 a 1. Lido pelo painel a cada quadro. */
    @Volatile var nivel = 0f
    /** A tela do Jarvis está visível? (apps só podem ser abertos livremente nesse caso) */
    @Volatile var telaVisivel = false
    /** O que o Jarvis está fazendo na tela agora ("Tocando em Pesquisar"), mostrado na bolha. */
    @Volatile var passo = ""
    /** Modo ao vivo: depois de cada resposta ele segue ouvindo, sem precisar ser chamado de novo. */
    @Volatile var aoVivo = false
    /**
     * Tela de outro app que o Jarvis quer abrir mas não pôde, porque o celular está bloqueado.
     * A tela do Jarvis, que aparece por cima do bloqueio, pede o desbloqueio e então abre.
     */
    @Volatile var aAbrir: android.content.Intent? = null

    private val principal = Handler(Looper.getMainLooper())
    private val ouvintes = CopyOnWriteArrayList<() -> Unit>()

    fun mudar(bloco: Estado.() -> Unit) {
        bloco()
        principal.post { ouvintes.forEach { it() } }
    }

    fun observar(ouvinte: () -> Unit) { ouvintes.add(ouvinte) }
    fun pararDeObservar(ouvinte: () -> Unit) { ouvintes.remove(ouvinte) }
}

/** Escolhas feitas na tela, guardadas no aparelho. */
class Preferencias(contexto: Context) {
    private val p = contexto.getSharedPreferences("jarvis", Context.MODE_PRIVATE)

    var voz: Boolean
        get() = p.getBoolean("voz", true)
        set(v) = p.edit().putBoolean("voz", v).apply()

    var palmas: Boolean
        get() = p.getBoolean("palmas", true)
        set(v) = p.edit().putBoolean("palmas", v).apply()

    /** Chave da API do Claude, para conversar e responder perguntas. Fica só neste aparelho. */
    var chaveIa: String
        get() = p.getString("chaveIa", "") ?: ""
        set(v) = p.edit().putString("chaveIa", v.trim()).apply()

    /** Chave da ElevenLabs, para a voz natural. Em branco, fala com a voz do próprio Android. */
    var chaveVoz: String
        get() = p.getString("chaveVoz", "") ?: ""
        set(v) = p.edit().putString("chaveVoz", v.trim()).apply()

    /** Qual voz da ElevenLabs usar. Em branco, a padrão. */
    var idDaVoz: String
        get() = p.getString("idDaVoz", "") ?: ""
        set(v) = p.edit().putString("idDaVoz", v.trim()).apply()

    /** Chaves da API da Cakto (client id e client secret), para consultar as vendas. */
    var caktoId: String
        get() = p.getString("caktoId", "") ?: ""
        set(v) = p.edit().putString("caktoId", v.trim()).apply()

    var caktoSegredo: String
        get() = p.getString("caktoSegredo", "") ?: ""
        set(v) = p.edit().putString("caktoSegredo", v.trim()).apply()

    /** O Jarvis estava escutando? Serve para voltar a escutar depois que o celular reinicia. */
    var ativo: Boolean
        get() = p.getBoolean("ativo", false)
        set(v) = p.edit().putBoolean("ativo", v).apply()

    /** Falar "mensagem de Fulano" quando chega uma mensagem, sem ser chamado. */
    var avisarMensagens: Boolean
        get() = p.getBoolean("avisarMensagens", false)
        set(v) = p.edit().putBoolean("avisarMensagens", v).apply()

    /** Avisar 15 minutos antes de cada compromisso da agenda. */
    var avisarCompromissos: Boolean
        get() = p.getBoolean("avisarCompromissos", true)
        set(v) = p.edit().putBoolean("avisarCompromissos", v).apply()

    /** Teto de gasto por dia com a inteligência, em dólares. Zero é sem limite. */
    var limiteDiario: Float
        get() = p.getFloat("limiteDiario", 0.5f)
        set(v) = p.edit().putFloat("limiteDiario", v.coerceAtLeast(0f)).apply()

    /** De 1 (só palmas fortes) a 10 (palmas fracas ou distantes). */
    var sensibilidade: Int
        get() = p.getInt("sensibilidade", 7)
        set(v) = p.edit().putInt("sensibilidade", v.coerceIn(1, 10)).apply()
}
