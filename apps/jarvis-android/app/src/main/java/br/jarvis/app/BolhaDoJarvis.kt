package br.jarvis.app

import android.widget.FrameLayout
import android.view.animation.OvershootInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.animation.AccelerateInterpolator
import android.animation.ValueAnimator
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
    private var moldura: FrameLayout? = null
    private var cartao: LinearLayout? = null
    private var onda: OndaView? = null
    private var saindo = false
    private val animar get() = ValueAnimator.areAnimatorsEnabled()
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
        onda?.fase = fase
        if (faseAnterior == Fase.AGUARDANDO && (fase == Fase.FALANDO || fase == Fase.OUVINDO || fase == Fase.PENSANDO)) g.chamar()
        faseAnterior = fase
        trocar(titulo, (if (Estado.aoVivo) "LIVE · " else "") + when (fase) {
            Fase.OUVINDO -> "OUVINDO"
            Fase.PENSANDO -> if (Estado.passo.isNotEmpty()) "AGINDO" else "PENSANDO"
            else -> "JARVIS"
        }, deslizar = true)
        trocar(corpo, when {
            fase == Fase.PENSANDO && Estado.passo.isNotEmpty() -> Estado.passo
            fase == Fase.OUVINDO || (fase == Fase.PENSANDO && Estado.resposta.isEmpty()) ->
                if (Estado.ouvido.isEmpty()) "…" else "“${Estado.ouvido}”"
            else -> Estado.resposta
        }, deslizar = false)
    }

    /**
     * Troca um texto. O título (o estado) entra deslizando de baixo, para a mudança de vez ser
     * percebida; o corpo cresce junto com a fala, então só troca, sem piscar a cada palavra.
     */
    private fun trocar(campo: TextView?, novo: String, deslizar: Boolean) {
        campo ?: return
        if (campo.text.toString() == novo) return
        campo.text = novo
        if (!deslizar || !animar) return
        campo.animate().cancel()
        campo.alpha = 0f
        campo.translationY = campo.height * 0.5f
        campo.animate().alpha(1f).translationY(0f).setDuration(180).setInterpolator(DecelerateInterpolator()).start()
    }

    /** Some por um instante para não sair na captura da tela. */
    fun ocultarParaCaptura(ocultar: Boolean) {
        moldura?.visibility = if (ocultar) View.INVISIBLE else View.VISIBLE
    }

    /** Sai de cena: o cartão se recolhe para o ponto de onde veio e a janela é removida. */
    fun esconder() {
        principal.removeCallbacks(sumir)
        val vista = moldura ?: return
        val interno = cartao
        if (saindo) return
        fun remover() {
            saindo = false
            if (moldura === vista) {
                moldura = null
                cartao = null
                globo = null
                onda = null
                titulo = null
                corpo = null
            }
            runCatching { janelas.removeView(vista) }
        }
        if (!animar || interno == null) {
            remover()
            return
        }
        saindo = true
        interno.animate().cancel()
        interno.animate().alpha(0f).scaleX(0.3f).scaleY(0.6f).translationY(-interno.height * 0.4f)
            .setDuration(220).setInterpolator(AccelerateInterpolator()).withEndAction { remover() }.start()
        // Rede de segurança: se a animação for cancelada pelo sistema, a janela não pode ficar na tela.
        principal.postDelayed({ if (moldura === vista && saindo) remover() }, 600)
    }

    /**
     * A entrada: o cartão nasce como uma faixa estreita no alto, abre para os lados passando um
     * pouco do tamanho e assenta; o globo se monta; os textos chegam logo depois, da esquerda.
     */
    private fun entrar(vista: View, g: GloboView, textos: View) {
        if (!animar) return
        vista.alpha = 0f
        vista.scaleX = 0.25f
        vista.scaleY = 0.6f
        vista.translationY = -40f * contexto.resources.displayMetrics.density
        vista.animate().alpha(1f).scaleX(1f).scaleY(1f).translationY(0f)
            .setDuration(420).setInterpolator(OvershootInterpolator(1.4f)).start()
        g.entrar()
        g.scaleX = 0.4f
        g.scaleY = 0.4f
        g.rotation = -90f
        g.animate().scaleX(1f).scaleY(1f).rotation(0f).setStartDelay(80).setDuration(520)
            .setInterpolator(OvershootInterpolator(1.8f)).start()
        textos.alpha = 0f
        textos.translationX = -24f * contexto.resources.displayMetrics.density
        textos.animate().alpha(1f).translationX(0f).setStartDelay(200).setDuration(260)
            .setInterpolator(DecelerateInterpolator()).start()
    }

    private fun mostrar() {
        if (moldura != null) {
            // Foi chamado de novo enquanto saía: cancela a saída e volta ao lugar.
            if (saindo) {
                saindo = false
                cartao?.let {
                    it.animate().cancel()
                    it.animate().alpha(1f).scaleX(1f).scaleY(1f).translationY(0f).setDuration(160).start()
                }
            }
            return
        }
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
        val o = OndaView(contexto)
        val textos = LinearLayout(contexto).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(10), 0, 0, 0)
            addView(t)
            addView(c)
            addView(o, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(18)).apply { topMargin = dp(6) })
        }
        val vista = LinearLayout(contexto).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundResource(R.drawable.bolha)
            setPadding(dp(10), dp(8), dp(14), dp(8))
            addView(g, LinearLayout.LayoutParams(dp(56), dp(56)))
            addView(textos, LinearLayout.LayoutParams(dp(230), LinearLayout.LayoutParams.WRAP_CONTENT))
        }
        // A moldura dá folga em volta do cartão, para ele poder crescer um pouco além do tamanho final
        // e descer do alto sem ser cortado pela borda da janela.
        val quadro = FrameLayout(contexto).apply {
            clipChildren = false
            clipToPadding = false
            setPadding(dp(16), dp(24), dp(16), dp(12))
            addView(vista, FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT))
        }
        val parametros = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
            y = dp(12)
        }
        try {
            janelas.addView(quadro, parametros)
            moldura = quadro
            cartao = vista
            globo = g
            onda = o
            titulo = t
            corpo = c
            entrar(vista, g, textos)
        } catch (e: Exception) {
            // Sem a permissão de aparecer por cima, o Jarvis segue funcionando só pela voz.
        }
    }
}
