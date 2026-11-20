package br.jarvis.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import android.view.animation.LinearInterpolator
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * O painel animado do centro da tela. Cada parte do desenho mostra algo real:
 *
 * - os anéis giram mais rápido quanto mais ocupado o Jarvis está (parado,
 *   aguardando, pensando);
 * - as barras em volta do núcleo acompanham o som do microfone enquanto ele
 *   ouve, e fazem uma onda enquanto ele fala ou pensa;
 * - uma onda se abre do centro no instante em que ele é chamado.
 *
 * Se as animações do sistema estiverem desligadas (acessibilidade), o painel
 * fica parado e só muda de aparência quando o estado muda.
 */
class ReatorView @JvmOverloads constructor(contexto: Context, attrs: AttributeSet? = null) : View(contexto, attrs) {
    private val ciano = contexto.getColor(R.color.ciano)
    private val apagado = contexto.getColor(R.color.ciano_escuro)
    private val traco = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val barra = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND }
    private val cheio = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val brilho = Paint(Paint.ANTI_ALIAS_FLAG)

    private var ultimoQuadro = 0L
    private var tempo = 0f          // segundos desde que o painel apareceu
    private var anguloExterno = 0f  // graus
    private var anguloMedio = 0f
    private var anguloInterno = 0f
    private var velocidade = 0f     // graus por segundo, suavizada
    private var energia = 0f        // 0 = parado, 1 = ativo; suaviza a troca de cor e brilho
    private var nivel = 0f          // volume suavizado, 0 a 1
    private var inicioDaOnda = -10f // instante (em `tempo`) em que o Jarvis foi chamado

    var fase: Fase = Fase.PARADO
        set(valor) {
            field = valor
            invalidate()
        }

    private val animador = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 1000
        repeatCount = ValueAnimator.INFINITE
        interpolator = LinearInterpolator()
        addUpdateListener { avancar() }
    }

    /** Dispara a onda que se abre do centro: o sinal visível de "ouvi você". */
    fun chamar() {
        inicioDaOnda = tempo
        invalidate()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        ultimoQuadro = 0L
        animador.start()
    }

    override fun onDetachedFromWindow() {
        animador.cancel()
        super.onDetachedFromWindow()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        val raio = min(w, h) / 2f
        if (raio <= 0f) return
        brilho.shader = RadialGradient(
            w / 2f, h / 2f, raio * 0.62f,
            intArrayOf(Color.argb(150, Color.red(ciano), Color.green(ciano), Color.blue(ciano)), Color.TRANSPARENT),
            null, Shader.TileMode.CLAMP
        )
    }

    private fun avancar() {
        val agora = System.nanoTime()
        val dt = if (ultimoQuadro == 0L) 0f else ((agora - ultimoQuadro) / 1e9f).coerceAtMost(0.1f)
        ultimoQuadro = agora
        tempo += dt

        val velocidadeAlvo = when (fase) {
            Fase.PARADO -> 0f
            Fase.CARREGANDO -> 90f
            Fase.AGUARDANDO -> 18f
            Fase.OUVINDO -> 45f
            Fase.PENSANDO -> 220f
            Fase.FALANDO -> 40f
        }
        val nivelAlvo = when (fase) {
            Fase.PARADO, Fase.CARREGANDO, Fase.PENSANDO -> 0f
            // Aguardando, o som do ambiente aparece de leve; ouvindo, em cheio.
            Fase.AGUARDANDO -> Estado.nivel * 0.5f
            Fase.OUVINDO -> Estado.nivel
            // O celular não informa o volume da própria voz; a cadência abaixo imita uma fala.
            Fase.FALANDO -> 0.35f + 0.3f * sin(tempo * 9f) * sin(tempo * 2.3f) + 0.2f * sin(tempo * 17f)
        }.coerceIn(0f, 1f)

        val suave = (dt * 6f).coerceAtMost(1f)
        velocidade += (velocidadeAlvo - velocidade) * suave
        energia += ((if (fase == Fase.PARADO) 0f else 1f) - energia) * suave
        // Sobe rápido, desce devagar: as barras acompanham a voz sem tremer.
        nivel += (nivelAlvo - nivel) * (dt * if (nivelAlvo > nivel) 18f else 6f).coerceAtMost(1f)

        anguloExterno = (anguloExterno + velocidade * 0.25f * dt) % 360f
        anguloMedio = (anguloMedio + velocidade * dt) % 360f
        anguloInterno = (anguloInterno - velocidade * 0.6f * dt) % 360f
        invalidate()
    }

    private fun cor(alfa: Float): Int {
        val a = (alfa.coerceIn(0f, 1f) * 255).toInt()
        fun mistura(de: Int, para: Int) = (de + (para - de) * energia).toInt()
        return Color.argb(
            a,
            mistura(Color.red(apagado), Color.red(ciano)),
            mistura(Color.green(apagado), Color.green(ciano)),
            mistura(Color.blue(apagado), Color.blue(ciano)),
        )
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = height / 2f
        val raio = min(width, height) / 2f * 0.94f

        // Brilho atrás do núcleo: cresce com a voz.
        brilho.alpha = ((0.25f + 0.75f * nivel) * energia * 255).toInt()
        canvas.drawCircle(cx, cy, raio * 0.62f, brilho)

        // Régua externa: 60 marcas, uma mais longa a cada cinco.
        traco.strokeWidth = raio * 0.008f
        for (i in 0 until 60) {
            val a = Math.toRadians((anguloExterno + i * 6f).toDouble())
            val longa = i % 5 == 0
            val r1 = raio * if (longa) 0.93f else 0.96f
            traco.color = cor(if (longa) 0.7f else 0.3f)
            canvas.drawLine(
                cx + r1 * cos(a).toFloat(), cy + r1 * sin(a).toFloat(),
                cx + raio * cos(a).toFloat(), cy + raio * sin(a).toFloat(), traco
            )
        }

        // Anel fino fixo.
        traco.strokeWidth = raio * 0.006f
        traco.color = cor(0.45f)
        canvas.drawCircle(cx, cy, raio * 0.86f, traco)

        // Três segmentos girando num sentido...
        traco.strokeWidth = raio * 0.035f
        traco.color = cor(0.9f)
        val r2 = raio * 0.77f
        for (k in 0 until 3) {
            canvas.drawArc(cx - r2, cy - r2, cx + r2, cy + r2, anguloMedio + k * 120f, 72f, false, traco)
        }
        // ...e dois, mais finos, no sentido contrário.
        traco.strokeWidth = raio * 0.012f
        traco.color = cor(0.6f)
        val r3 = raio * 0.67f
        for (k in 0 until 2) {
            canvas.drawArc(cx - r3, cy - r3, cx + r3, cy + r3, anguloInterno + k * 180f, 115f, false, traco)
        }

        // Barras de som em volta do núcleo.
        val base = raio * 0.36f
        val alcance = raio * 0.22f
        barra.strokeWidth = raio * 0.016f
        for (i in 0 until BARRAS) {
            val fracao = i / BARRAS.toFloat()
            val a = 2 * PI * fracao - PI / 2
            val altura = when (fase) {
                // Uma onda dando a volta: "estou trabalhando nisso".
                Fase.PENSANDO, Fase.CARREGANDO ->
                    0.12f + 0.55f * ((sin(2 * PI * (fracao * 2 - tempo * 0.9f)) + 1) / 2).toFloat().let { it * it }
                // Cada barra tem seu ritmo, para o conjunto parecer um espectro de voz.
                else -> 0.06f * energia + nivel * (0.45f + 0.55f * sin(tempo * (5f + i % 7) + i * 1.7f).let { (it + 1) / 2 })
            }
            barra.color = cor(0.35f + 0.65f * altura)
            val r1 = base
            val r2b = base + alcance * altura.coerceIn(0f, 1f)
            canvas.drawLine(
                cx + r1 * cos(a).toFloat(), cy + r1 * sin(a).toFloat(),
                cx + r2b * cos(a).toFloat(), cy + r2b * sin(a).toFloat(), barra
            )
        }

        // Núcleo.
        cheio.color = cor(0.55f + 0.45f * nivel)
        canvas.drawCircle(cx, cy, raio * (0.24f + 0.05f * nivel), cheio)
        traco.strokeWidth = raio * 0.01f
        traco.color = cor(1f)
        canvas.drawCircle(cx, cy, raio * 0.31f, traco)

        // Onda de chamada: um anel que se abre do núcleo até a borda e some.
        val progresso = (tempo - inicioDaOnda) / DURACAO_DA_ONDA
        if (progresso in 0f..1f) {
            val saida = 1f - (1f - progresso) * (1f - progresso) // desacelera no fim
            traco.strokeWidth = raio * 0.03f * (1f - progresso)
            traco.color = cor(1f - progresso)
            canvas.drawCircle(cx, cy, raio * (0.31f + 0.69f * saida), traco)
        }
    }

    companion object {
        private const val BARRAS = 48
        private const val DURACAO_DA_ONDA = 0.7f
    }
}
