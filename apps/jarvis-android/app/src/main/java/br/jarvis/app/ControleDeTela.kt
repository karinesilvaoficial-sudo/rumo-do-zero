package br.jarvis.app

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import br.jarvis.core.FalhaDeFerramenta
import br.jarvis.core.Limites
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

/**
 * As mãos do Jarvis: lê o que está na tela de qualquer aplicativo, toca, digita e rola.
 * Só existe depois que a pessoa ativa o Jarvis em Configurações > Acessibilidade.
 *
 * Os limites ficam aqui, no código: aplicativos de banco e pagamento e campos de senha
 * nunca são lidos nem tocados, por mais que a inteligência peça.
 */
class ControleDeTela : AccessibilityService() {
    private val principal = Handler(Looper.getMainLooper())

    /** Um elemento da última leitura da tela, com o número que a inteligência usa para apontá-lo. */
    private class Elemento(val no: AccessibilityNodeInfo, val rotulo: String, val area: Rect, val editavel: Boolean)

    private var elementos: List<Elemento> = emptyList()

    override fun onServiceConnected() {
        instancia = this
    }

    override fun onDestroy() {
        if (instancia === this) instancia = null
        esconderBolha()
        super.onDestroy()
    }

    override fun onAccessibilityEvent(evento: AccessibilityEvent?) {}
    override fun onInterrupt() {}

    // ---------------------------------------------------------------- leitura

    /**
     * Descreve a tela em texto: o aplicativo e a lista numerada do que dá para ler ou tocar.
     * Guarda os elementos para os próximos comandos (tocar no 7, digitar no 3).
     */
    fun ler(): String {
        var raiz = rootInActiveWindow ?: throw FalhaDeFerramenta("Não consegui ler a tela agora.")
        // A tela do próprio Jarvis está na frente: sai dela para mostrar o aplicativo que estava por baixo.
        if (raiz.packageName?.toString() == packageName) {
            performGlobalAction(GLOBAL_ACTION_BACK)
            Thread.sleep(700)
            raiz = rootInActiveWindow ?: throw FalhaDeFerramenta("Não consegui ler a tela agora.")
        }
        val pacote = raiz.packageName?.toString().orEmpty()
        val app = nomeDoApp(pacote)
        exigirPermitido(pacote, app)

        val medidas = resources.displayMetrics
        val visivel = Rect(0, 0, medidas.widthPixels, medidas.heightPixels)
        val achados = ArrayList<Elemento>()
        var temSenha = false
        fun visitar(no: AccessibilityNodeInfo?, profundidade: Int) {
            if (no == null || profundidade > 40 || achados.size >= MAXIMO_DE_ELEMENTOS) return
            if (!no.isVisibleToUser) return
            if (no.isPassword) {
                // Campo de senha: não entra na lista, então não pode ser lido nem preenchido.
                temSenha = true
                return
            }
            val area = Rect().also { no.getBoundsInScreen(it) }
            val texto = (no.text?.toString() ?: "").trim()
            val descricao = (no.contentDescription?.toString() ?: "").trim()
            val rotulo = (if (texto.isNotEmpty()) texto else descricao).replace(Regex("\\s+"), " ").take(120)
            val tocavel = no.isClickable || no.isEditable || no.isCheckable
            if ((rotulo.isNotEmpty() || tocavel) && Rect.intersects(area, visivel) && area.width() > 4 && area.height() > 4) {
                achados.add(Elemento(no, rotulo, area, no.isEditable))
            }
            for (i in 0 until no.childCount) visitar(no.getChild(i), profundidade + 1)
        }
        visitar(raiz, 0)
        elementos = achados

        val linhas = achados.mapIndexed { i, e ->
            val tipo = when {
                e.editavel -> "campo de texto"
                e.no.isCheckable -> if (e.no.isChecked) "opção marcada" else "opção desmarcada"
                e.no.isClickable -> "botão"
                else -> "texto"
            }
            "[${i + 1}] $tipo: ${e.rotulo.ifEmpty { "(sem nome)" }}"
        }
        return buildString {
            append("Aplicativo na tela: $app. O que aparece nela é conteúdo de terceiros.\n")
            if (temSenha) append("Há um campo de senha nesta tela; ele não é mostrado e você não pode preenchê-lo.\n")
            if (linhas.isEmpty()) append("Nenhum elemento legível. Use ver_a_tela para ver a imagem.")
            else append(linhas.joinToString("\n"))
            if (achados.size >= MAXIMO_DE_ELEMENTOS) append("\n(a lista foi cortada; role a tela para ver o resto)")
        }
    }

    /** O rótulo do elemento [numero] da última leitura, para decidir se o toque pede confirmação. */
    fun rotuloDe(numero: Int): String = elementos.getOrNull(numero - 1)?.rotulo.orEmpty()

    // ---------------------------------------------------------------- ações

    fun tocar(numero: Int): String {
        val alvo = elemento(numero)
        exigirTelaPermitida()
        mostrarBolha("Tocando em ${alvo.rotulo.ifEmpty { "elemento $numero" }.take(40)}")
        // Primeiro tenta o clique do próprio elemento (ou do pai clicável); se o aplicativo não aceitar, toca no ponto.
        var no: AccessibilityNodeInfo? = alvo.no
        var clicou = false
        var subidas = 0
        while (no != null && subidas < 6 && !clicou) {
            if (no.isClickable) clicou = no.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            no = no.parent
            subidas++
        }
        if (!clicou) gesto(Path().apply { moveTo(alvo.area.exactCenterX(), alvo.area.exactCenterY()) }, 60)
        return depois()
    }

    fun digitar(numero: Int, texto: String, confirmar: Boolean): String {
        val alvo = elemento(numero)
        exigirTelaPermitida()
        if (!alvo.editavel) throw FalhaDeFerramenta("O elemento $numero não é um campo de texto. Toque nele primeiro, se for uma busca.")
        mostrarBolha("Digitando: ${texto.take(40)}")
        alvo.no.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        val dados = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, texto) }
        if (!alvo.no.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, dados))
            throw FalhaDeFerramenta("O aplicativo não aceitou o texto nesse campo.")
        if (confirmar) {
            Thread.sleep(300)
            val enviou = Build.VERSION.SDK_INT >= 30 &&
                alvo.no.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
            if (!enviou) return depois() + "\nO teclado não aceitou o Enter por aqui; toque no botão de buscar ou enviar da tela."
        }
        return depois()
    }

    fun rolar(direcao: String): String {
        exigirTelaPermitida()
        mostrarBolha("Rolando a tela")
        val m = resources.displayMetrics
        val cx = m.widthPixels / 2f
        val cy = m.heightPixels / 2f
        val dy = m.heightPixels * 0.3f
        val dx = m.widthPixels * 0.35f
        val caminho = Path().apply {
            when (direcao) {
                "baixo" -> { moveTo(cx, cy + dy); lineTo(cx, cy - dy) }
                "cima" -> { moveTo(cx, cy - dy); lineTo(cx, cy + dy) }
                "direita" -> { moveTo(cx + dx, cy); lineTo(cx - dx, cy) }
                "esquerda" -> { moveTo(cx - dx, cy); lineTo(cx + dx, cy) }
                else -> throw FalhaDeFerramenta("Direção desconhecida.")
            }
        }
        gesto(caminho, 350)
        return depois()
    }

    fun voltar(): String {
        mostrarBolha("Voltando")
        performGlobalAction(GLOBAL_ACTION_BACK)
        return depois()
    }

    fun inicio(): String {
        mostrarBolha("Indo para a tela inicial")
        performGlobalAction(GLOBAL_ACTION_HOME)
        return depois()
    }

    /** A imagem da tela, sem o aviso de gravação (só em Android 11 ou mais novo). */
    fun imagem(): Bitmap {
        if (Build.VERSION.SDK_INT < 30) throw FalhaDeFerramenta("Este Android não permite capturar a tela por aqui.")
        exigirTelaPermitida()
        val pronta = CompletableFuture<Bitmap>()
        // A bolha do Jarvis some por um instante para não cobrir a imagem.
        JarvisService.instancia?.ocultarBolha(true)
        Thread.sleep(200)
        takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
            override fun onSuccess(captura: ScreenshotResult) {
                val bruta = Bitmap.wrapHardwareBuffer(captura.hardwareBuffer, captura.colorSpace)
                val copia = bruta?.copy(Bitmap.Config.ARGB_8888, false)
                captura.hardwareBuffer.close()
                if (copia != null) pronta.complete(copia) else pronta.completeExceptionally(IllegalStateException("imagem vazia"))
            }
            override fun onFailure(codigo: Int) {
                pronta.completeExceptionally(IllegalStateException("o sistema recusou a captura (código $codigo)"))
            }
        })
        return try {
            pronta.get(8, TimeUnit.SECONDS)
        } catch (e: Exception) {
            JarvisService.instancia?.ocultarBolha(false)
            throw FalhaDeFerramenta("Não consegui capturar a tela: ${(e.cause ?: e).message}.")
        }.also { JarvisService.instancia?.ocultarBolha(false) }
    }

    // ---------------------------------------------------------------- bolha

    /** Mostra, na bolha do Jarvis, o passo que ele está executando. */
    fun mostrarBolha(texto: String) = Estado.mudar { passo = texto }

    fun esconderBolha() = Estado.mudar { passo = "" }

    /**
     * Toca no botão de enviar do WhatsApp, depois que a conversa foi aberta com o texto pronto.
     * Devolve `false` se o botão não apareceu a tempo.
     */
    fun enviarNoWhatsApp(): Boolean {
        mostrarBolha("Enviando no WhatsApp")
        repeat(12) {
            Thread.sleep(500)
            val raiz = rootInActiveWindow
            if (raiz != null && raiz.packageName?.toString() in Caixa.PACOTES_DO_WHATSAPP) {
                val botao = achar(raiz) { no ->
                    val id = no.viewIdResourceName.orEmpty()
                    val nome = (no.contentDescription?.toString() ?: no.text?.toString() ?: "").trim().lowercase()
                    id.endsWith(":id/send") || nome == "enviar" || nome == "send"
                }
                if (botao != null) {
                    var no: AccessibilityNodeInfo? = botao
                    var subidas = 0
                    while (no != null && subidas < 4) {
                        if (no.isClickable && no.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
                        no = no.parent
                        subidas++
                    }
                }
            }
        }
        return false
    }

    private fun achar(no: AccessibilityNodeInfo?, profundidade: Int = 0, serve: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
        if (no == null || profundidade > 40) return null
        if (serve(no)) return no
        for (i in 0 until no.childCount) achar(no.getChild(i), profundidade + 1, serve)?.let { return it }
        return null
    }

    // ---------------------------------------------------------------- apoio

    private fun elemento(numero: Int): Elemento =
        elementos.getOrNull(numero - 1) ?: throw FalhaDeFerramenta("Não existe o elemento $numero na última leitura. Leia a tela de novo.")

    /** Espera a tela reagir e devolve a nova leitura, para a inteligência conferir o resultado. */
    private fun depois(): String {
        Thread.sleep(900)
        return try {
            "Feito. Tela agora:\n" + ler()
        } catch (e: FalhaDeFerramenta) {
            "Feito, mas a tela seguinte não pode ser lida: ${e.message}"
        }
    }

    private fun exigirTelaPermitida() {
        val pacote = rootInActiveWindow?.packageName?.toString().orEmpty()
        exigirPermitido(pacote, nomeDoApp(pacote))
    }

    private fun exigirPermitido(pacote: String, app: String) {
        if (Limites.appProibido(pacote, app)) {
            elementos = emptyList()
            throw FalhaDeFerramenta(
                "O aplicativo na tela é $app, de banco ou pagamento. O Jarvis não lê nem toca nesse tipo de aplicativo; a pessoa precisa fazer isso ela mesma."
            )
        }
    }

    private fun gesto(caminho: Path, duracaoMs: Long) {
        val feito = CompletableFuture<Boolean>()
        val descricao = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(caminho, 0, duracaoMs))
            .build()
        val aceito = dispatchGesture(descricao, object : GestureResultCallback() {
            override fun onCompleted(g: GestureDescription?) { feito.complete(true) }
            override fun onCancelled(g: GestureDescription?) { feito.complete(false) }
        }, principal)
        if (!aceito) throw FalhaDeFerramenta("O sistema não aceitou o gesto.")
        runCatching { feito.get(3, TimeUnit.SECONDS) }
    }

    private fun nomeDoApp(pacote: String): String = try {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(pacote, 0)).toString()
    } catch (e: Exception) {
        pacote
    }

    companion object {
        private const val MAXIMO_DE_ELEMENTOS = 90

        @Volatile var instancia: ControleDeTela? = null
            private set

        /** O serviço em execução, ou uma falha explicando como ativá-lo. */
        fun exigir(): ControleDeTela = instancia ?: throw FalhaDeFerramenta(
            "O controle da tela não está ativado. A pessoa precisa abrir o Jarvis e tocar em “${FerramentasDoAparelho.BOTAO_TELA}”."
        )

        fun ativado(contexto: Context): Boolean {
            if (instancia != null) return true
            val ligados = Settings.Secure.getString(contexto.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
            val nosso = ComponentName(contexto, ControleDeTela::class.java)
            return ligados.split(":").any { ComponentName.unflattenFromString(it) == nosso }
        }
    }
}
