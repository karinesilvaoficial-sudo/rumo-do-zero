package br.jarvis.app

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * O painel do Jarvis: um globo de pontos e linhas que gira. A velocidade mostra o estado
 * (devagar aguardando, rápido pensando), o brilho acompanha o som do microfone e uma onda
 * se abre quando ele é chamado.
 */
class GloboView @JvmOverloads constructor(contexto: Context, attrs: AttributeSet? = null) : View(contexto, attrs) {
    var fase: Fase = Fase.PARADO
        set(valor) {
            field = valor
            invalidate()
        }

    private val ciano = contexto.getColor(R.color.ciano)
    private val ponto = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ciano; style = Paint.Style.FILL }
    private val linha = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ciano; style = Paint.Style.STROKE }
    private val brilho = Paint(Paint.ANTI_ALIAS_FLAG)

    /** Pontos na superfície, como (x, y, z) de uma esfera de raio 1; os "continentes" têm mais pontos. */
    private val pontos: FloatArray
    private var angulo = 0.0
    private var nivelSuave = 0f
    private var ultimoQuadro = 0L
    private var inicioDaOnda = 0L
    private val animar = ValueAnimator.areAnimatorsEnabled()

    init {
        // Espiral de Fibonacci: espalha os pontos por igual na esfera. Um ruído simples decide
        // quais ficam, formando manchas que lembram terra e mar.
        val total = 900
        val lista = ArrayList<Float>(total * 3)
        val dourado = PI * (3.0 - sqrt(5.0))
        for (i in 0 until total) {
            val y = 1.0 - 2.0 * (i + 0.5) / total
            val raio = sqrt(1.0 - y * y)
            val teta = dourado * i
            val x = cos(teta) * raio
            val z = sin(teta) * raio
            val terra = sin(x * 3.1 + 1.3) * cos(y * 2.7 - 0.4) + sin(z * 3.7 + y * 2.1) * 0.8
            if (terra > 0.15 || i % 9 == 0) {
                lista.add(x.toFloat()); lista.add(y.toFloat()); lista.add(z.toFloat())
            }
        }
        pontos = lista.toFloatArray()
    }

    /** Dispara a onda que se abre do centro: o Jarvis acabou de ser chamado. */
    fun chamar() {
        inicioDaOnda = System.nanoTime()
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val agora = System.nanoTime()
        val dt = if (ultimoQuadro == 0L) 0.0 else ((agora - ultimoQuadro) / 1e9).coerceAtMost(0.1)
        ultimoQuadro = agora

        val velocidade = when (fase) {
            Fase.PARADO -> 0.08
            Fase.CARREGANDO -> 0.5
            Fase.AGUARDANDO -> 0.25
            Fase.OUVINDO -> 0.6
            Fase.PENSANDO -> 2.2
            Fase.FALANDO -> 0.9
        }
        if (animar) angulo += dt * velocidade
        nivelSuave += (Estado.nivel - nivelSuave) * 0.25f

        val cx = width / 2f
        val cy = height / 2f
        val base = minOf(width, height) / 2f
        val pulso = if (fase == Fase.OUVINDO || fase == Fase.FALANDO) nivelSuave * 0.06f else 0f
        val raio = base * (0.72f + pulso)
        val forca = if (fase == Fase.PARADO) 0.35f else 1f

        // Halo atrás do globo.
        brilho.shader = RadialGradient(
            cx, cy, base, intArrayOf(comAlfa(0.28f * forca + nivelSuave * 0.2f), comAlfa(0.06f * forca), comAlfa(0f)),
            floatArrayOf(0f, 0.7f, 1f), Shader.TileMode.CLAMP
        )
        canvas.drawCircle(cx, cy, base, brilho)

        val seno = sin(angulo).toFloat()
        val cosseno = cos(angulo).toFloat()
        val inclinacao = 0.35f
        val senoI = sin(inclinacao.toDouble()).toFloat()
        val cossenoI = cos(inclinacao.toDouble()).toFloat()

        // Meridianos e paralelos: a "grade" do globo.
        linha.strokeWidth = base * 0.006f
        for (m in 0 until 8) desenharCurva(canvas, cx, cy, raio, seno, cosseno, senoI, cossenoI, forca) { t ->
            val lon = m * PI / 8
            val lat = t * 2 * PI
            Triple((cos(lat) * cos(lon)).toFloat(), sin(lat).toFloat(), (cos(lat) * sin(lon)).toFloat())
        }
        for (p in 1 until 6) desenharCurva(canvas, cx, cy, raio, seno, cosseno, senoI, cossenoI, forca) { t ->
            val lat = -PI / 2 + p * PI / 6
            val lon = t * 2 * PI
            Triple((cos(lat) * cos(lon)).toFloat(), sin(lat).toFloat(), (cos(lat) * sin(lon)).toFloat())
        }

        // Pontos dos continentes: os da frente brilham, os de trás ficam apagados.
        var i = 0
        while (i < pontos.size) {
            val x0 = pontos[i]; val y0 = pontos[i + 1]; val z0 = pontos[i + 2]
            val x = x0 * cosseno + z0 * seno
            val z1 = -x0 * seno + z0 * cosseno
            val y = y0 * cossenoI - z1 * senoI
            val z = y0 * senoI + z1 * cossenoI
            val frente = (z + 1f) / 2f
            ponto.color = comAlfa((0.12f + 0.88f * frente * frente) * forca)
            canvas.drawCircle(cx + x * raio, cy - y * raio, base * (0.006f + 0.008f * frente), ponto)
            i += 3
        }

        // Contorno e anel externo.
        linha.color = comAlfa(0.55f * forca)
        linha.strokeWidth = base * 0.012f
        canvas.drawCircle(cx, cy, raio, linha)
        linha.color = comAlfa(0.25f * forca)
        linha.strokeWidth = base * 0.008f
        val varredura = ((angulo * 40) % 360).toFloat()
        canvas.drawArc(cx - base * 0.93f, cy - base * 0.93f, cx + base * 0.93f, cy + base * 0.93f, varredura, 110f, false, linha)
        canvas.drawArc(cx - base * 0.93f, cy - base * 0.93f, cx + base * 0.93f, cy + base * 0.93f, varredura + 180f, 70f, false, linha)

        // Onda ao ser chamado.
        var ondaAtiva = false
        if (inicioDaOnda != 0L) {
            val t = (agora - inicioDaOnda) / 0.9e9f
            if (t < 1f) {
                ondaAtiva = true
                linha.color = comAlfa((1f - t) * 0.8f)
                linha.strokeWidth = base * 0.02f * (1f - t)
                canvas.drawCircle(cx, cy, raio * (0.4f + t * 0.95f), linha)
            } else inicioDaOnda = 0L
        }

        if (animar && (fase != Fase.PARADO || ondaAtiva) && isAttachedToWindow) postInvalidateOnAnimation()
    }

    /** Desenha uma curva fechada da esfera, girada e inclinada, mais clara na frente que atrás. */
    private inline fun desenharCurva(
        canvas: Canvas, cx: Float, cy: Float, raio: Float,
        seno: Float, cosseno: Float, senoI: Float, cossenoI: Float, forca: Float,
        posicao: (Double) -> Triple<Float, Float, Float>,
    ) {
        val passos = 48
        var xAnterior = 0f; var yAnterior = 0f
        for (k in 0..passos) {
            val (x0, y0, z0) = posicao(k.toDouble() / passos)
            val x = x0 * cosseno + z0 * seno
            val z1 = -x0 * seno + z0 * cosseno
            val y = y0 * cossenoI - z1 * senoI
            val z = y0 * senoI + z1 * cossenoI
            val px = cx + x * raio
            val py = cy - y * raio
            if (k > 0) {
                linha.color = comAlfa((if (z >= 0f) 0.30f else 0.07f) * forca)
                canvas.drawLine(xAnterior, yAnterior, px, py, linha)
            }
            xAnterior = px; yAnterior = py
        }
    }

    private fun comAlfa(alfa: Float): Int =
        (ciano and 0x00FFFFFF) or ((abs(alfa).coerceIn(0f, 1f) * 255).toInt() shl 24)
}
