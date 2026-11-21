package br.jarvis.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.util.AttributeSet
import android.view.View
import kotlin.math.abs
import kotlin.math.sin

/**
 * A voz em forma de barras: sobem com o som do microfone enquanto o Jarvis ouve, ondulam
 * enquanto ele pensa e pulsam enquanto fala. Mostra, sem texto, de quem é a vez.
 */
class OndaView @JvmOverloads constructor(contexto: Context, attrs: AttributeSet? = null) : View(contexto, attrs) {
    var fase: Fase = Fase.PARADO
        set(valor) {
            field = valor
            invalidate()
        }

    private val tinta = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = contexto.getColor(R.color.ciano) }
    private val alturas = FloatArray(BARRAS)
    private val animar = ValueAnimator.areAnimatorsEnabled()
    private var nivelSuave = 0f

    override fun onDraw(canvas: Canvas) {
        val t = System.nanoTime() / 1e9
        nivelSuave += (Estado.nivel - nivelSuave) * 0.35f
        val passo = width.toFloat() / BARRAS
        val largura = passo * 0.5f
        val meio = height / 2f
        for (i in 0 until BARRAS) {
            // Cada barra tem um ritmo próprio, para o conjunto parecer uma onda e não um bloco.
            val ritmo = (sin(t * (5.0 + i % 4) + i * 0.9) * 0.5 + 0.5).toFloat()
            val centro = 1f - abs(i - (BARRAS - 1) / 2f) / (BARRAS / 2f)
            val alvo = when (fase) {
                Fase.OUVINDO -> 0.12f + nivelSuave * (0.35f + 0.65f * ritmo) * (0.5f + 0.5f * centro)
                Fase.PENSANDO -> 0.15f + 0.35f * (sin(t * 4.0 - i * 0.55) * 0.5 + 0.5).toFloat()
                Fase.FALANDO -> 0.2f + 0.7f * ritmo * (0.4f + 0.6f * centro)
                else -> 0.08f
            }
            alturas[i] += (alvo - alturas[i]) * (if (animar) 0.3f else 1f)
            val metade = (height * alturas[i].coerceIn(0.06f, 1f)) / 2f
            tinta.alpha = (120 + 135 * alturas[i].coerceIn(0f, 1f)).toInt()
            val x = i * passo + (passo - largura) / 2f
            canvas.drawRoundRect(x, meio - metade, x + largura, meio + metade, largura / 2f, largura / 2f, tinta)
        }
        if (animar && isAttachedToWindow && fase != Fase.PARADO && fase != Fase.AGUARDANDO) postInvalidateOnAnimation()
    }

    private companion object {
        const val BARRAS = 22
    }
}
