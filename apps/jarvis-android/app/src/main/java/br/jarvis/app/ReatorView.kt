package br.jarvis.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View
import android.view.animation.LinearInterpolator
import kotlin.math.PI
import kotlin.math.min
import kotlin.math.sin

/** O círculo luminoso do centro da tela; pulsa conforme o que o Jarvis está fazendo. */
class ReatorView @JvmOverloads constructor(contexto: Context, attrs: AttributeSet? = null) : View(contexto, attrs) {
    private val ciano = contexto.getColor(R.color.ciano)
    private val apagado = contexto.getColor(R.color.ciano_escuro)
    private val anel = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val nucleo = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private var t = 0f

    var fase: Fase = Fase.PARADO
        set(valor) {
            field = valor
            invalidate()
        }

    private val animador = ValueAnimator.ofFloat(0f, 1f).apply {
        duration = 2400
        repeatCount = ValueAnimator.INFINITE
        interpolator = LinearInterpolator()
        addUpdateListener {
            t = it.animatedValue as Float
            invalidate()
        }
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        animador.start()
    }

    override fun onDetachedFromWindow() {
        animador.cancel()
        super.onDetachedFromWindow()
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = height / 2f
        val raio = min(width, height) / 2f * 0.86f
        val ativo = fase != Fase.PARADO
        // Quantas pulsações por ciclo e com que força, conforme a fase.
        val (ritmo, forca) = when (fase) {
            Fase.PARADO -> 0 to 0f
            Fase.CARREGANDO -> 1 to 0.3f
            Fase.AGUARDANDO -> 1 to 0.5f
            Fase.OUVINDO -> 4 to 1f
            Fase.FALANDO -> 3 to 0.8f
        }
        val pulso = if (ritmo == 0) 0f else ((sin(2 * PI * t * ritmo) + 1) / 2).toFloat() * forca
        val cor = if (ativo) ciano else apagado

        anel.color = cor
        anel.strokeWidth = raio * 0.05f
        anel.alpha = if (ativo) 255 else 160
        canvas.drawCircle(cx, cy, raio, anel)

        anel.strokeWidth = raio * 0.02f
        anel.alpha = (90 + 120 * pulso).toInt()
        canvas.drawCircle(cx, cy, raio * (0.74f + 0.05f * pulso), anel)

        // Segmentos girando no anel do meio.
        anel.strokeWidth = raio * 0.07f
        anel.alpha = if (ativo) 200 else 90
        val r2 = raio * 0.56f
        val giro = if (ativo) t * 360f else 0f
        for (k in 0 until 3) {
            canvas.drawArc(cx - r2, cy - r2, cx + r2, cy + r2, giro + k * 120f, 80f, false, anel)
        }

        nucleo.color = cor
        nucleo.alpha = if (ativo) (150 + 105 * pulso).toInt() else 110
        canvas.drawCircle(cx, cy, raio * (0.26f + 0.06f * pulso), nucleo)
    }
}
