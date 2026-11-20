package br.jarvis.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.os.VibrationEffect
import android.provider.Settings
import android.os.Vibrator
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import br.jarvis.core.Comando
import br.jarvis.core.DetectorPalmas
import br.jarvis.core.Interpretador
import br.jarvis.core.Roteador
import br.jarvis.core.PalavraChave
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.StorageService
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import kotlin.concurrent.thread

/**
 * Fica em segundo plano escutando o microfone.
 *
 * Ciclo: aguarda "Jarvis" ou 3 palmas -> responde -> ouve o comando -> executa
 * -> fala o resultado -> volta a aguardar. O microfone é usado por uma coisa
 * de cada vez: enquanto o Jarvis fala ou o reconhecedor do Android ouve o
 * comando, a escuta de fundo fica pausada.
 */
class JarvisService : Service() {
    private val principal = Handler(Looper.getMainLooper())
    private lateinit var preferencias: Preferencias
    private lateinit var executor: Executor

    private var modelo: Model? = null
    private var voz: TextToSpeech? = null
    private var vozPronta = false
    private val aoTerminarDeFalar = ConcurrentHashMap<String, () -> Unit>()
    private var contadorDeFalas = 0

    private var reconhecedor: SpeechRecognizer? = null
    private var cerebro: Cerebro? = null
    private var trava: PowerManager.WakeLock? = null

    @Volatile private var escutando = false
    /** Muda a cada início ou parada da escuta, para ignorar avisos de uma escuta antiga. */
    private var geracao = 0
    private var fio: Thread? = null
    private var encerrado = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        preferencias = Preferencias(this)
        executor = Executor(this)

        if (!entrarEmPrimeiroPlano()) {
            encerrado = true
            stopSelf()
            return
        }
        rodando = true
        Estado.mudar { fase = Fase.CARREGANDO; ouvido = ""; resposta = ""; aviso = "" }

        trava = getSystemService(PowerManager::class.java)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "jarvis:escuta").apply { acquire() }

        voz = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                voz?.language = Locale("pt", "BR")
                voz?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(id: String?) {}
                    override fun onDone(id: String?) = falaTerminou(id)
                    @Deprecated("Deprecated in Java")
                    override fun onError(id: String?) = falaTerminou(id)
                    override fun onError(id: String?, codigo: Int) = falaTerminou(id)
                })
                vozPronta = true
            }
        }

        // O modelo de voz vem dentro do APK e é copiado para o aparelho no primeiro uso.
        StorageService.unpack(this, "model-en", "modelo",
            { m ->
                if (encerrado) m.close() else {
                    modelo = m
                    iniciarEscuta()
                }
            },
            { erro ->
                Log.e(TAG, "Modelo de voz indisponível", erro)
                if (!encerrado) {
                    Estado.mudar { aviso = "A ativação por voz não pôde ser carregada. As palmas continuam funcionando." }
                    iniciarEscuta()
                }
            })
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACAO_PARAR -> stopSelf()
            ACAO_ATIVAR -> if (Estado.fase == Fase.AGUARDANDO) {
                pararEscuta()
                aoAtivar()
            }
            ACAO_RECARREGAR -> if (Estado.fase == Fase.AGUARDANDO) {
                pararEscuta()
                iniciarEscuta()
            }
        }
        // Se o sistema encerrar o serviço, ele não volta sozinho: o Android não deixa
        // religar o microfone sem a pessoa abrir o app.
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        encerrado = true
        rodando = false
        principal.removeCallbacksAndMessages(null)
        pararEscuta()
        descartarReconhecedor()
        voz?.shutdown()
        voz = null
        modelo?.close()
        modelo = null
        trava?.let { if (it.isHeld) it.release() }
        Estado.mudar { fase = Fase.PARADO }
        super.onDestroy()
    }

    // ---------------------------------------------------------------- notificação

    private fun entrarEmPrimeiroPlano(): Boolean {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return false
        val gerente = getSystemService(NotificationManager::class.java)
        gerente.createNotificationChannel(
            NotificationChannel(CANAL, getString(R.string.notificacao_canal), NotificationManager.IMPORTANCE_LOW)
        )
        val imutavel = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        val abrir = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), imutavel)
        val parar = PendingIntent.getService(this, 1, Intent(this, JarvisService::class.java).setAction(ACAO_PARAR), imutavel)
        val notificacao = Notification.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_notificacao)
            .setContentTitle(getString(R.string.notificacao_canal))
            .setContentText(getString(R.string.notificacao_texto))
            .setContentIntent(abrir)
            .setOngoing(true)
            .addAction(
                Notification.Action.Builder(
                    Icon.createWithResource(this, R.drawable.ic_notificacao), getString(R.string.parar), parar
                ).build()
            )
            .build()
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(ID_NOTIFICACAO, notificacao, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(ID_NOTIFICACAO, notificacao)
            }
            true
        } catch (e: Exception) {
            Log.e(TAG, "Não foi possível iniciar em primeiro plano", e)
            false
        }
    }

    // ---------------------------------------------------------------- escuta de fundo

    private fun iniciarEscuta() {
        if (encerrado || escutando) return
        if (!preferencias.voz && !preferencias.palmas) {
            Estado.mudar { fase = Fase.AGUARDANDO; aviso = "As duas formas de acordar estão desligadas. Use o botão para falar." }
            return
        }
        escutando = true
        val minhaGeracao = ++geracao
        Estado.mudar { fase = Fase.AGUARDANDO }
        val usarPalmas = preferencias.palmas
        val modeloDeVoz = if (preferencias.voz) modelo else null
        val limiar = DetectorPalmas.limiarParaSensibilidade(preferencias.sensibilidade)
        fio = thread(name = "jarvis-escuta") { lacoDeEscuta(minhaGeracao, usarPalmas, modeloDeVoz, limiar) }
    }

    private fun pararEscuta() {
        escutando = false
        geracao++
        fio?.let {
            if (it !== Thread.currentThread()) it.join(1500)
        }
        fio = null
    }

    /** Lê o microfone até ouvir "Jarvis" ou a sequência de palmas. Roda fora da thread principal. */
    private fun lacoDeEscuta(minhaGeracao: Int, usarPalmas: Boolean, modeloDeVoz: Model?, limiar: Double) {
        var gravador: AudioRecord? = null
        var reconhecedorDeFundo: Recognizer? = null
        var ativou = false
        try {
            val minimo = AudioRecord.getMinBufferSize(TAXA, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            gravador = AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION, TAXA,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minimo, TAXA)
            )
            if (gravador.state != AudioRecord.STATE_INITIALIZED) throw IllegalStateException("microfone ocupado")
            // O reconhecedor só conhece as palavras de GRAMATICA: o nome e algumas
            // parecidas, que servem para não confundir outras falas com "Jarvis".
            if (modeloDeVoz != null) reconhecedorDeFundo = Recognizer(modeloDeVoz, TAXA.toFloat(), GRAMATICA)
            val detector = DetectorPalmas(TAXA, 3, limiar)
            val bloco = ShortArray(TAXA / 10)
            var blocosComNome = 0

            gravador.startRecording()
            while (escutando) {
                val lidas = gravador.read(bloco, 0, bloco.size)
                if (lidas < 0) throw IllegalStateException("leitura do microfone falhou ($lidas)")
                if (lidas == 0) continue

                var pico = 0
                for (i in 0 until lidas) {
                    val v = bloco[i].toInt()
                    if (v > pico) pico = v else if (-v > pico) pico = -v
                }
                Estado.nivel = (pico / 9000f).coerceAtMost(1f)

                if (usarPalmas && detector.processar(bloco, lidas)) {
                    ativou = true
                    break
                }
                val rec = reconhecedorDeFundo ?: continue
                val fimDaFrase = rec.acceptWaveForm(bloco, lidas)
                val texto = if (fimDaFrase) JSONObject(rec.result).optString("text")
                else JSONObject(rec.partialResult).optString("partial")
                // Vale quando a frase termina com o nome, ou quando o palpite parcial
                // se mantém por alguns blocos seguidos (evita disparo por um palpite passageiro).
                blocosComNome = if (PalavraChave.procurar(texto).ativou) blocosComNome + 1 else 0
                if (blocosComNome >= (if (fimDaFrase) 1 else BLOCOS_PARA_CONFIRMAR)) {
                    ativou = true
                    break
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Escuta interrompida", e)
            principal.post {
                if (minhaGeracao != geracao || encerrado) return@post
                escutando = false
                Estado.mudar { aviso = "Não consegui usar o microfone. Outro app pode estar usando." }
                // Tenta de novo daqui a pouco (por exemplo, depois de uma ligação).
                principal.postDelayed({ if (Estado.fase == Fase.AGUARDANDO) iniciarEscuta() }, 5000)
            }
        } finally {
            Estado.nivel = 0f
            try { gravador?.stop() } catch (_: Exception) {}
            gravador?.release()
            reconhecedorDeFundo?.close()
        }
        if (ativou) {
            principal.post {
                if (minhaGeracao != geracao || encerrado) return@post
                escutando = false
                fio = null
                aoAtivar()
            }
        }
    }

    // ---------------------------------------------------------------- conversa

    /** O Jarvis foi chamado: aparece na tela, avisa que está pronto e ouve o comando. */
    private fun aoAtivar() {
        vibrar()
        mostrarPainel()
        Estado.mudar { aviso = ""; ouvido = ""; resposta = "" }
        falar("Sim?") { ouvirComando() }
    }

    /** Traz a tela do Jarvis para a frente (acende a tela e aparece sobre o bloqueio). */
    private fun mostrarPainel() {
        if (Estado.telaVisivel) return
        if (!Settings.canDrawOverlays(this)) {
            Estado.mudar { aviso = "Para o Jarvis aparecer na tela ao ser chamado, toque em “Permitir aparecer na tela e abrir apps”." }
            return
        }
        try {
            startActivity(
                Intent(this, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            )
        } catch (e: Exception) {
            Log.e(TAG, "Não consegui mostrar o painel", e)
        }
    }

    /**
     * Ouve uma fala pelo reconhecedor do Android.
     * [continuacao] indica que é a sequência de uma conversa: se a pessoa não
     * disser nada, o Jarvis volta a aguardar em silêncio.
     */
    private fun ouvirComando(continuacao: Boolean = false) {
        if (encerrado) return
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            falar("O reconhecimento de voz do aparelho não está disponível.") { iniciarEscuta() }
            return
        }
        Estado.mudar { fase = Fase.OUVINDO }
        var resolvido = false
        fun resolver(texto: String?, erro: Int = 0) {
            if (resolvido || encerrado) return
            resolvido = true
            Estado.nivel = 0f
            principal.removeCallbacksAndMessages(FICHA_TEMPO_ESGOTADO)
            descartarReconhecedor()
            when {
                !texto.isNullOrBlank() -> {
                    Estado.mudar { ouvido = texto }
                    val comando = Interpretador.interpretar(texto)
                    // Uma confirmação pendente ("posso enviar?") recebe a fala inteira, seja ela qual for.
                    val confirmando = cerebro?.aguardandoConfirmacao == true
                    // Só o nome de um app instalado ("YouTube") abre o app, sem passar pela inteligência.
                    val soNomeDeApp = !confirmando && comando is Comando.Desconhecido &&
                        texto.trim().split(Regex("\\s+")).size <= 3 && executor.conheceApp(texto)
                    when {
                        soNomeDeApp -> responder(Comando.AbrirApp(texto))
                        confirmando || Roteador.paraAInteligencia(texto, comando, preferencias.chaveIa.isNotBlank()) -> conversar(texto)
                        else -> responder(comando)
                    }
                }
                erro == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                    falar("Preciso da permissão do microfone.") { iniciarEscuta() }
                erro == SpeechRecognizer.ERROR_NETWORK || erro == SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                    falar("Sem internet para entender o comando.") { iniciarEscuta() }
                continuacao -> iniciarEscuta()
                else -> falar("Não ouvi nada.") { iniciarEscuta() }
            }
        }

        val r = SpeechRecognizer.createSpeechRecognizer(this)
        reconhecedor = r
        r.setRecognitionListener(object : RecognitionListener {
            override fun onResults(resultados: Bundle?) =
                resolver(resultados?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull())
            override fun onError(erro: Int) = resolver(null, erro)
            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {
                // O reconhecedor informa o volume em decibéis, mais ou menos de -2 a 10.
                Estado.nivel = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
            }
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(parciais: Bundle?) {}
            override fun onEvent(tipo: Int, params: Bundle?) {}
        })
        val pedido = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR")
            .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        r.startListening(pedido)
        // Rede de segurança: se o reconhecedor não responder, não fica preso ouvindo.
        principal.postAtTime({ resolver(null) }, FICHA_TEMPO_ESGOTADO, SystemClock.uptimeMillis() + 15_000)
    }

    private fun descartarReconhecedor() {
        reconhecedor?.let {
            try {
                it.cancel()
                it.destroy()
            } catch (_: Exception) {}
        }
        reconhecedor = null
    }

    private fun responder(comando: Comando) {
        // O que não é um comando conhecido vira conversa.
        if (comando is Comando.Desconhecido) {
            conversar(comando.texto)
            return
        }
        val r = executor.executar(comando)
        Estado.mudar { resposta = r.fala }
        falar(r.fala) {
            when (r.depois) {
                Depois.VOLTAR_A_ESCUTAR -> iniciarEscuta()
                Depois.OUVIR_DE_NOVO -> ouvirComando(continuacao = true)
                Depois.DESLIGAR -> stopSelf()
            }
        }
    }

    /** Responde uma fala livre com a inteligência; sem chave configurada, pesquisa na internet. */
    private fun conversar(texto: String) {
        val chave = preferencias.chaveIa
        if (chave.isBlank()) {
            Estado.mudar { aviso = "Para eu responder qualquer pergunta falando, cole a chave da inteligência na tela do Jarvis. Por enquanto, pesquisei na internet." }
            responder(Comando.Pesquisar(texto))
            return
        }
        val mente = cerebro?.takeIf { it.chave == chave } ?: Cerebro(this, chave, executor).also { cerebro = it }
        Estado.mudar { fase = Fase.PENSANDO; resposta = "" }
        thread(name = "jarvis-conversa") {
            val dito = mente.perguntar(texto)
            principal.post {
                if (encerrado) return@post
                Estado.mudar { resposta = dito }
                falar(dito) { ouvirComando(continuacao = true) }
            }
        }
    }

    /** Fala o texto e chama [depois] quando terminar (ou na hora, se não houver voz disponível). */
    private fun falar(texto: String, depois: () -> Unit) {
        val motor = voz
        if (encerrado) return
        if (texto.isBlank() || motor == null || !vozPronta) {
            principal.post { if (!encerrado) depois() }
            return
        }
        Estado.mudar { fase = Fase.FALANDO }
        val id = "fala-${++contadorDeFalas}"
        aoTerminarDeFalar[id] = depois
        if (motor.speak(texto, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) falaTerminou(id)
        // Rede de segurança caso o motor de voz nunca avise que terminou.
        principal.postDelayed({ falaTerminou(id) }, 20_000)
    }

    private fun falaTerminou(id: String?) {
        val depois = aoTerminarDeFalar.remove(id ?: return) ?: return
        principal.post { if (!encerrado) depois() }
    }

    private fun vibrar() {
        try {
            @Suppress("DEPRECATION")
            (getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)
                ?.vibrate(VibrationEffect.createOneShot(60, VibrationEffect.DEFAULT_AMPLITUDE))
        } catch (_: Exception) {}
    }

    companion object {
        private const val TAG = "Jarvis"
        private const val CANAL = "jarvis"
        private const val ID_NOTIFICACAO = 1
        private const val TAXA = 16000
        /** Blocos de 100 ms seguidos em que o nome precisa aparecer no palpite parcial. */
        private const val BLOCOS_PARA_CONFIRMAR = 3
        private const val GRAMATICA = "[\"jarvis\", \"service\", \"harvest\", \"travis\", \"nervous\", \"jar\", \"[unk]\"]"
        private val FICHA_TEMPO_ESGOTADO = Any()

        const val ACAO_PARAR = "br.jarvis.app.PARAR"
        const val ACAO_ATIVAR = "br.jarvis.app.ATIVAR"
        const val ACAO_RECARREGAR = "br.jarvis.app.RECARREGAR"

        @Volatile var rodando = false
            private set

        fun iniciar(contexto: Context) {
            contexto.startForegroundService(Intent(contexto, JarvisService::class.java))
        }

        fun enviar(contexto: Context, acao: String) {
            if (rodando) contexto.startService(Intent(contexto, JarvisService::class.java).setAction(acao))
        }
    }
}
