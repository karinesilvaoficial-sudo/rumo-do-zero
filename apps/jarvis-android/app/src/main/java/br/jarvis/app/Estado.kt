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
    /** A tela do Jarvis está visível? (apps só podem ser abertos livremente nesse caso) */
    @Volatile var telaVisivel = false

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

    /** De 1 (só palmas fortes) a 10 (palmas fracas ou distantes). */
    var sensibilidade: Int
        get() = p.getInt("sensibilidade", 5)
        set(v) = p.edit().putInt("sensibilidade", v.coerceIn(1, 10)).apply()
}
