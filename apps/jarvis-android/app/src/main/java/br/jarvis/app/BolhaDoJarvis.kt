package br.jarvis.app

import android.app.KeyguardManager
import android.content.Context
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView

/**
 * O Jarvis na forma pequena: um cartão no topo da tela, por cima do aplicativo em uso, com o
 * globo e o que ele está ouvindo, fazendo ou dizendo. Aparece quando ele é chamado e some
 * quando volta a aguardar. Não recebe toques, então não atrapalha o aplicativo de baixo.
 */
class BolhaDoJarvis(private val contexto: Context) {
    private val principal = Handler(Looper.getMainLooper())
    private val janelas = contexto.getSystemService(WindowManager::class.java)
    private var cartao: LinearLayout? = null
    private var globo: GloboView? = null
    private var titulo: TextView? = null
    private var corpo: TextView? = null
    private val sumir = Runnable { esconder() }
    private var faseAnterior = Fase.PARADO

    /** Deve ser chamado na thread principal a cada mudança de estado. */
    fun atualizar() {
        val fase = Estado.fase
        val ativo = fase == Fase.OUVINDO || fase == Fase.PENSANDO || fase == Fase.FALANDO
        val trancado = contexto.getSystemService(KeyguardManager::class.java)?.isKeyguardLocked == true
        // Com a tela do Jarvis aberta ou o celular bloqueado, quem aparece é a tela cheia.
        if (Estado.telaVisivel || trancado || !Settings.canDrawOverlays(contexto) || fase == Fase.PARADO) {
            esconder()
            return
        }
        if (ativo) {
            principal.removeCallbacks(sumir)
            mostrar()
        } else if (cartao != null) {
            // Voltou a aguardar: fica mais um pouco para dar tempo de ler a resposta.
            principal.removeCallbacks(sumir)
            principal.postDelayed(sumir, if (Estado.aoVivo) 60_000 else 5_000)
        }
        val g = globo ?: return
        g.fase = fase
        if (faseAnterior == Fase.AGUARDANDO && (fase == Fase.FALANDO || fase == Fase.OUVINDO || fase == Fase.PENSANDO)) g.chamar()
        faseAnterior = fase
        titulo?.text = (if (Estado.aoVivo) "LIVE · " else "") + when (fase) {
            Fase.OUVINDO -> "Ouvindo"
            Fase.PENSANDO -> if (Estado.passo.isNotEmpty()) "Agindo" else "Pensando"
            Fase.FALANDO -> "Jarvis"
            else -> "Jarvis"
        }
        corpo?.text = when {
            fase == Fase.PENSANDO && Estado.passo.isNotEmpty() -> Estado.passo
            fase == Fase.OUVINDO || (fase == Fase.PENSANDO && Estado.resposta.isEmpty()) ->
                if (Estado.ouvido.isEmpty()) "…" else "“${Estado.ouvido}”"
            else -> Estado.resposta
        }
    }

    /** Some por um instante para não sair na captura da tela. */
    fun ocultarParaCaptura(ocultar: Boolean) {
        cartao?.visibility = if (ocultar) View.INVISIBLE else View.VISIBLE
    }

    fun esconder() {
        principal.removeCallbacks(sumir)
        val vista = cartao ?: return
        cartao = null
        globo = null
        titulo = null
        corpo = null
        runCatching { janelas.removeView(vista) }
    }

    private fun mostrar() {
        if (cartao != null) return
        val d = contexto.resources.displayMetrics.density
        fun dp(v: Int) = (v * d).toInt()
        val ciano = contexto.getColor(R.color.ciano)
        val g = GloboView(contexto)
        val t = TextView(contexto).apply {
            setTextColor(ciano)
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            letterSpacing = 0.08f
        }
        val c = TextView(contexto).apply {
            setTextColor(contexto.getColor(R.color.texto))
            textSize = 14f
            maxLines = 3
            ellipsize = TextUtils.TruncateAt.END
        }
        val textos = LinearLayout(contexto).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(10), 0, 0, 0)
            addView(t)
            addView(c)
        }
        val vista = LinearLayout(contexto).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundResource(R.drawable.bolha)
            setPadding(dp(10), dp(8), dp(14), dp(8))
            addView(g, LinearLayout.LayoutParams(dp(56), dp(56)))
            addView(textos, LinearLayout.LayoutParams(dp(230), LinearLayout.LayoutParams.WRAP_CONTENT))
        }
        val parametros = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = dp(36)
        }
        try {
            janelas.addView(vista, parametros)
            cartao = vista
            globo = g
            titulo = t
            corpo = c
        } catch (e: Exception) {
            // Sem a permissão de aparecer por cima, o Jarvis segue funcionando só pela voz.
        }
    }
}
