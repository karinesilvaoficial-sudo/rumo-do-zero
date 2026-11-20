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
        StorageService.unpack(this, "model-pt", "modelo",
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
                aoAtivar("")
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
        var resto = ""
        try {
            val minimo = AudioRecord.getMinBufferSize(TAXA, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            gravador = AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION, TAXA,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(minimo, TAXA)
            )
            if (gravador.state != AudioRecord.STATE_INITIALIZED) throw IllegalStateException("microfone ocupado")
            if (modeloDeVoz != null) reconhecedorDeFundo = Recognizer(modeloDeVoz, TAXA.toFloat())
            val detector = DetectorPalmas(TAXA, 3, limiar)
            val bloco = ShortArray(TAXA / 10)
            var nomeOuvidoEm = 0L

            gravador.startRecording()
            while (escutando) {
                val lidas = gravador.read(bloco, 0, bloco.size)
                if (lidas < 0) throw IllegalStateException("leitura do microfone falhou ($lidas)")
                if (lidas == 0) continue

                if (usarPalmas && detector.processar(bloco, lidas)) {
                    ativou = true
                    resto = ""
                    break
                }
                val rec = reconhecedorDeFundo ?: continue
                val fimDaFrase = rec.acceptWaveForm(bloco, lidas)
                val texto = if (fimDaFrase) JSONObject(rec.result).optString("text")
                else JSONObject(rec.partialResult).optString("partial")
                val achado = PalavraChave.procurar(texto)
                if (achado.ativou) {
                    if (nomeOuvidoEm == 0L) nomeOuvidoEm = SystemClock.elapsedRealtime()
                    resto = achado.resto
                }
                // Depois de ouvir o nome, espera a frase acabar para aproveitar um
                // comando dito junto ("Jarvis, que horas são?"), mas sem demorar.
                if (nomeOuvidoEm != 0L && (fimDaFrase || SystemClock.elapsedRealtime() - nomeOuvidoEm > ESPERA_DA_FRASE_MS)) {
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
            try { gravador?.stop() } catch (_: Exception) {}
            gravador?.release()
            reconhecedorDeFundo?.close()
        }
        if (ativou) {
            val dito = resto
            principal.post {
                if (minhaGeracao != geracao || encerrado) return@post
                escutando = false
                fio = null
                aoAtivar(dito)
            }
        }
    }

    // ---------------------------------------------------------------- conversa

    /** O Jarvis foi chamado. [dito] é o que veio junto com o nome, se veio algo. */
    private fun aoAtivar(dito: String) {
        vibrar()
        Estado.mudar { aviso = "" }
        val comando = if (dito.isBlank()) Comando.Vazio else Interpretador.interpretar(dito)
        val daParaAgirDireto = when (comando) {
            Comando.Vazio, is Comando.Desconhecido -> false
            is Comando.AbrirApp -> executor.conheceApp(comando.nome)
            else -> true
        }
        if (daParaAgirDireto) {
            Estado.mudar { ouvido = dito }
            responder(comando)
        } else {
            Estado.mudar { ouvido = ""; resposta = "" }
            falar("Às ordens.") { ouvirComando() }
        }
    }

    private fun ouvirComando() {
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
            principal.removeCallbacksAndMessages(FICHA_TEMPO_ESGOTADO)
            descartarReconhecedor()
            when {
                !texto.isNullOrBlank() -> {
                    Estado.mudar { ouvido = texto }
                    responder(Interpretador.interpretar(texto))
                }
                erro == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                    falar("Preciso da permissão do microfone.") { iniciarEscuta() }
                erro == SpeechRecognizer.ERROR_NETWORK || erro == SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                    falar("Sem internet para entender o comando.") { iniciarEscuta() }
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
            override fun onRmsChanged(rmsdB: Float) {}
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
        val r = executor.executar(comando)
        Estado.mudar { resposta = r.fala }
        falar(r.fala) {
            when (r.depois) {
                Depois.VOLTAR_A_ESCUTAR -> iniciarEscuta()
                Depois.DESLIGAR -> stopSelf()
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
        private const val ESPERA_DA_FRASE_MS = 2500L
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
