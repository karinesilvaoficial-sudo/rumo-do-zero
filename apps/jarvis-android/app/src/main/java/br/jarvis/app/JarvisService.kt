package br.jarvis.app

import br.jarvis.core.FalhaDeServico
import br.jarvis.core.Texto
import android.app.KeyguardManager
import java.util.concurrent.TimeUnit
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.CountDownLatch
import br.jarvis.core.Fala
import br.jarvis.core.CapturaDeFala
import android.provider.CalendarContract
import android.content.ContentUris
import android.content.BroadcastReceiver
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.AudioAttributes
import android.media.ImageReader
import android.media.MediaPlayer
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.BatteryManager
import android.util.DisplayMetrics
import android.view.WindowManager
import br.jarvis.core.VigiaDaBateria
import br.jarvis.core.VozNatural
import java.io.File
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
 * Ciclo: aguarda "Jarvis" ou 2 palmas -> responde -> ouve o comando -> executa
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
    private var esperandoNomeDeApp = false
    @Volatile private var pararTarefa = false
    private var avisouDaPermissao = false
    private var trava: PowerManager.WakeLock? = null
    private var notificacaoFixa: Notification? = null
    private var tocador: MediaPlayer? = null
    private lateinit var bolha: BolhaDoJarvis
    private val aoMudarEstado: () -> Unit = { if (!encerrado) bolha.atualizar() }
    private var silenciosAoVivo = 0
    /** A resposta que está sendo falada agora, para poder ser interrompida. */
    private var falaEmCurso: FalaContinua? = null
    /** A inteligência já terminou a resposta em curso? (ou só resta acabar de falar) */
    private var respostaPronta = false
    private var falaSubstituta: FalaContinua? = null
    /**
     * Chave da ElevenLabs que acabou de ser recusada, para falar ou para transcrever. Enquanto ela
     * não for trocada, o Jarvis nem tenta: cada tentativa recusada atrasava a resposta em segundos.
     */
    @Volatile private var chaveSemFala = ""
    @Volatile private var chaveSemTranscricao = ""
    /** Muda a cada fala nova, para uma fala antiga parar de tocar os trechos que faltavam. */
    @Volatile private var falaAtual = 0
    private val compromissosAvisados = HashSet<String>()
    private val vigiaDaBateria = VigiaDaBateria()
    private val aoMudarBateria = object : BroadcastReceiver() {
        override fun onReceive(contexto: Context, intent: Intent) {
            val nivel = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val escala = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            if (nivel < 0 || escala <= 0) return
            val estado = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            val carregando = estado == BatteryManager.BATTERY_STATUS_CHARGING || estado == BatteryManager.BATTERY_STATUS_FULL
            vigiaDaBateria.avaliar(nivel * 100 / escala, carregando)?.let { anunciar(it) }
        }
    }

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
        bolha = BolhaDoJarvis(this)
        Estado.observar(aoMudarEstado)

        if (!entrarEmPrimeiroPlano()) {
            encerrado = true
            stopSelf()
            return
        }
        rodando = true
        instancia = this
        preferencias.ativo = true
        registerReceiver(aoMudarBateria, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        principal.postDelayed(::conferirCompromissos, 60_000)
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
            ACAO_PARAR -> {
                preferencias.ativo = false
                stopSelf()
            }
            // Botão "Modo live" da tela: vale quando ele está aguardando ou já no meio do live.
            ACAO_LIVE -> if (Estado.aoVivo) {
                descartarReconhecedor()
                mudarLive(false)
            } else if (Estado.fase == Fase.AGUARDANDO) {
                pararEscuta()
                mostrarPainel()
                mudarLive(true)
            }
            ACAO_ANUNCIAR -> intent.getStringExtra(EXTRA_TEXTO)?.let { anunciar(it) }
            ACAO_ATIVAR -> if (Estado.fase == Fase.AGUARDANDO) {
                pararEscuta()
                aoAtivar()
            }
            ACAO_RECARREGAR -> if (Estado.fase == Fase.AGUARDANDO) {
                // A pessoa mexeu nas configurações: uma chave recusada antes merece nova tentativa.
                chaveSemFala = ""
                chaveSemTranscricao = ""
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
        if (instancia === this) {
            instancia = null
            try {
                unregisterReceiver(aoMudarBateria)
            } catch (e: IllegalArgumentException) {
                // O serviço parou antes de registrar.
            }
        }
        falaEmCurso?.cancelar()
        falaEmCurso = null
        tocador?.release()
        tocador = null
        Estado.pararDeObservar(aoMudarEstado)
        bolha.esconder()
        Estado.aoVivo = false
        Estado.passo = ""
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
        notificacaoFixa = notificacao
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

    /**
     * Enquanto o Jarvis executa uma tarefa, continua ouvindo só o nome: dizer "Jarvis" de novo
     * manda parar. As palmas ficam de fora, porque o som de um vídeo dispararia à toa.
     */
    private fun iniciarEscutaDeInterrupcao() {
        val modeloDeVoz = modelo
        if (encerrado || escutando || !preferencias.voz || modeloDeVoz == null) return
        escutando = true
        val minhaGeracao = ++geracao
        fio = thread(name = "jarvis-interrupcao") { lacoDeEscuta(minhaGeracao, false, modeloDeVoz, 0.0, interrupcao = true) }
    }

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
    private fun lacoDeEscuta(
        minhaGeracao: Int, usarPalmas: Boolean, modeloDeVoz: Model?, limiar: Double, interrupcao: Boolean = false,
    ) {
        var gravador: AudioRecord? = null
        var reconhecedorDeFundo: Recognizer? = null
        var ativou = false
        var falaDireta: ByteArray? = null
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
            val detector = DetectorPalmas(TAXA, DetectorPalmas.PALMAS_PARA_ACORDAR, limiar)
            val bloco = ShortArray(TAXA / 10)
            var blocosComNome = 0
            // O último segundo de áudio: quando o nome é reconhecido, o começo do comando já passou por aqui.
            val recentes = ArrayDeque<ShortArray>()
            val capturarComando = !interrupcao && preferencias.chaveVoz.let { it.isNotBlank() && it != chaveSemTranscricao }

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
                if (capturarComando) {
                    recentes.addLast(bloco.copyOf(lidas))
                    if (recentes.size > 10) recentes.removeFirst()
                }

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
                    if (capturarComando) {
                        // "Jarvis, abre o YouTube" numa frase só: segue gravando até a pessoa se calar.
                        val captura = CapturaDeFala(TAXA, limiarDeFala = 700.0, esperaPorFalaMs = 700)
                        for (anterior in recentes) captura.comecarCom(anterior, anterior.size)
                        var estado = CapturaDeFala.Estado.OUVINDO
                        while (escutando && estado == CapturaDeFala.Estado.OUVINDO) {
                            val n = gravador.read(bloco, 0, bloco.size)
                            if (n < 0) break
                            if (n > 0) estado = captura.alimentar(bloco, n)
                        }
                        if (estado == CapturaDeFala.Estado.CONCLUIDA) falaDireta = Fala.wav(captura.audio(), captura.quantidade, TAXA)
                    }
                    ativou = true
                    break
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Escuta interrompida", e)
            principal.post {
                if (minhaGeracao != geracao || encerrado) return@post
                escutando = false
                // No meio de uma tarefa o microfone é só um extra: sem ele, a tarefa segue.
                if (interrupcao) return@post
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
                if (interrupcao) {
                    pararTarefa = true
                    vibrar()
                    val fala = falaEmCurso
                    if (fala != null && respostaPronta) {
                        // Ele só estava falando: cala na hora e ouve o que a pessoa quer dizer.
                        falaEmCurso = null
                        fala.cancelar()
                        Estado.mudar { resposta = "" }
                        ouvirComando(continuacao = true)
                    } else {
                        // Ainda estava trabalhando: para a fala e a tarefa; a inteligência confirma a interrupção.
                        fala?.cancelar()
                        falaEmCurso = FalaContinua().also { nova -> substituirFala(nova) }
                        Estado.mudar { resposta = "Parando…" }
                    }
                } else {
                    val audio = falaDireta
                    if (audio != null) aoOuvirDeUmaVez(audio) else aoAtivar()
                }
            }
        }
    }

    // ---------------------------------------------------------------- conversa

    /** O Jarvis foi chamado: aparece na tela, avisa que está pronto e ouve o comando. */
    private fun aoAtivar() {
        vibrar()
        mostrarPainel()
        Estado.mudar { aviso = ""; ouvido = ""; resposta = "" }
        // Sem a permissão de aparecer, o aviso ficaria numa tela que ninguém está vendo: fala uma vez.
        val semPermissao = !Estado.telaVisivel && !Settings.canDrawOverlays(this)
        val saudacao = if (semPermissao && !avisouDaPermissao) {
            avisouDaPermissao = true
            "Sim, mestre? Para eu aparecer na tela e abrir aplicativos, abra o Jarvis e toque em permitir aparecer na tela."
        } else SAUDACOES.random()
        Estado.mudar { resposta = saudacao }
        falar(saudacao) { ouvirComando() }
    }

    /** Traz a tela do Jarvis para a frente (acende a tela e aparece sobre o bloqueio). */
    private fun mostrarPainel() {
        if (Estado.telaVisivel) return
        // Desbloqueado, o Jarvis aparece como uma bolha por cima do aplicativo em uso (ver BolhaDoJarvis).
        // A tela cheia fica para o celular bloqueado, onde a bolha não pode aparecer.
        if (Settings.canDrawOverlays(this) && getSystemService(KeyguardManager::class.java)?.isKeyguardLocked != true) return
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
                    tratarFala(texto)
                }
                erro == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                    falar("Preciso da permissão do microfone.") { iniciarEscuta() }
                erro == SpeechRecognizer.ERROR_NETWORK || erro == SpeechRecognizer.ERROR_NETWORK_TIMEOUT ->
                    falar("Sem internet para entender o comando.") { iniciarEscuta() }
                // No modo ao vivo, um silêncio não encerra a conversa; depois de três seguidos, ele volta a aguardar.
                continuacao && Estado.aoVivo && ++silenciosAoVivo < 4 -> ouvirComando(continuacao = true)
                continuacao -> {
                    if (Estado.aoVivo) Estado.mudar { aoVivo = false; resposta = "Modo live encerrado." }
                    iniciarEscuta()
                }
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
            override fun onPartialResults(parciais: Bundle?) {
                // Mostra a fala enquanto a pessoa ainda está falando.
                val parcial = parciais?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
                if (!parcial.isNullOrBlank() && !resolvido) Estado.mudar { ouvido = parcial }
            }
            override fun onEvent(tipo: Int, params: Bundle?) {}
        })
        val pedido = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR")
            .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
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
                Depois.VOLTAR_A_ESCUTAR -> if (Estado.aoVivo) ouvirComando(continuacao = true) else iniciarEscuta()
                Depois.OUVIR_DE_NOVO ->
                    if (Roteador.esperaResposta(r.fala) || Estado.aoVivo) ouvirComando(continuacao = true) else iniciarEscuta()
                Depois.DESLIGAR -> {
                    Estado.aoVivo = false
                    preferencias.ativo = false
                    stopSelf()
                }
            }
        }
    }

    /**
     * A pessoa disse o nome e o comando juntos. Transcreve o áudio e atende direto, sem o
     * "Sim, mestre?". Se a transcrição falhar ou vier vazia, cai no fluxo normal.
     */
    private fun aoOuvirDeUmaVez(wav: ByteArray) {
        vibrar()
        mostrarPainel()
        Estado.mudar { aviso = ""; ouvido = "…"; resposta = ""; fase = Fase.PENSANDO }
        val chave = preferencias.chaveVoz
        thread(name = "jarvis-transcricao") {
            val texto = try {
                VozNatural(chave).transcrever(wav)
            } catch (e: Exception) {
                Log.e(TAG, "Transcrição falhou", e)
                if (e is FalhaDeServico && e.codigo in 400..499) {
                    chaveSemTranscricao = chave
                    Estado.mudar { aviso = "Comando junto do nome desligado: " + (e.message ?: "") }
                }
                ""
            }
            principal.post {
                if (encerrado) return@post
                val achado = PalavraChave.procurar(texto)
                val comando = (if (achado.ativou) achado.resto else texto).trim()
                if (comando.isEmpty()) aoAtivar() else {
                    Estado.mudar { ouvido = comando }
                    tratarFala(comando)
                }
            }
        }
    }

    /** Decide o que fazer com o que a pessoa falou: comando do aparelho, nome de app ou inteligência. */
    private fun tratarFala(texto: String) {
        Estado.mudar { ouvido = texto }
        silenciosAoVivo = 0
        val live = if (cerebro?.aguardandoConfirmacao == true) null else Roteador.pedidoDeLive(texto)
        if (live != null) {
            mudarLive(live)
            return
        }
        val comando = Interpretador.interpretar(texto)
        // Uma confirmação pendente ("posso enviar?") recebe a fala inteira, seja ela qual for.
        val confirmando = cerebro?.aguardandoConfirmacao == true
        // Só o nome de um app instalado ("YouTube") abre o app, sem passar pela inteligência.
        val soNomeDeApp = !confirmando && comando is Comando.Desconhecido &&
            texto.trim().split(Regex("\\s+")).size <= 3 && executor.conheceApp(texto)
        val esperavaNome = esperandoNomeDeApp
        esperandoNomeDeApp = false
        when {
            // Respondeu à pergunta "qual aplicativo?": a fala inteira é o nome.
            esperavaNome && comando !is Comando.Cancelar -> responder(
                if (comando is Comando.AbrirApp) comando else Comando.AbrirApp(texto)
            )
            // Disse só "abrir": pergunta qual app em vez de adivinhar.
            comando is Comando.AbrirJarvis && !PalavraChave.procurar(texto).ativou -> {
                esperandoNomeDeApp = true
                Estado.mudar { resposta = "Qual aplicativo, mestre?" }
                falar("Qual aplicativo, mestre?") { ouvirComando(continuacao = true) }
            }
            soNomeDeApp -> responder(Comando.AbrirApp(texto))
            confirmando || Roteador.paraAInteligencia(texto, comando, preferencias.chaveIa.isNotBlank()) -> conversar(texto)
            else -> responder(comando)
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
        val mente = cerebro?.takeIf { it.chave == chave }
            ?: Cerebro(this, chave, executor, interrompido = { pararTarefa }).also { cerebro = it }
        Estado.mudar { fase = Fase.PENSANDO; resposta = "" }
        pararTarefa = false
        iniciarEscutaDeInterrupcao()
        val fala = FalaContinua()
        falaEmCurso = fala
        falaSubstituta = null
        respostaPronta = false
        thread(name = "jarvis-conversa") {
            // Cada frase é falada assim que a inteligência a termina, sem esperar o resto da resposta.
            val dito = mente.perguntar(texto) { frase ->
                fala.dizer(frase)
                Estado.mudar { resposta = if (resposta.isEmpty() || resposta == "Parando…") frase else "$resposta $frase" }
            }
            principal.post {
                if (encerrado) return@post
                respostaPronta = true
                // Se a pessoa interrompeu no meio, a fala original foi calada: o desfecho sai por uma nova.
                val atual = falaSubstituta ?: fala
                falaSubstituta = null
                // Perguntas de confirmação e avisos de erro vêm do aplicativo, não do fluxo: ainda precisam ser ditos.
                if (!mente.jaFalou || atual !== fala) atual.dizer(dito)
                Estado.mudar { resposta = dito }
                atual.terminar {
                    if (falaEmCurso !== atual) return@terminar
                    falaEmCurso = null
                    pararEscuta()
                    // Conversa de verdade: depois de responder, ouve a próxima fala sem exigir o nome.
                    // Se a pessoa não disser nada, volta a aguardar em silêncio.
                    if (Roteador.esperaResposta(dito) || mente.aguardandoConfirmacao || Estado.aoVivo || preferencias.conversaContinua) ouvirComando(continuacao = true)
                    else iniciarEscuta()
                }
            }
        }
    }

    /**
     * A fala de uma resposta que chega aos poucos. As frases entram por [dizer] conforme ficam
     * prontas; uma linha gera o áudio de cada uma e outra toca na ordem, então a segunda frase já
     * está sendo gerada enquanto a primeira toca. [cancelar] cala tudo na hora.
     */
    private inner class FalaContinua {
        private val textos = LinkedBlockingQueue<String>()
        private val prontos = LinkedBlockingQueue<Pair<File?, String>>()
        @Volatile private var cancelada = false
        private var aoTerminar: (() -> Unit)? = null
        private val fim = "\u0000fim"
        private var comecou = false

        fun dizer(trecho: String) {
            if (cancelada || trecho.isBlank()) return
            synchronized(this) {
                if (!comecou) {
                    comecou = true
                    iniciar()
                }
            }
            textos.put(trecho)
        }

        /** Não há mais frases: [depois] roda na thread principal quando a última acabar de tocar. */
        fun terminar(depois: () -> Unit) {
            aoTerminar = depois
            synchronized(this) {
                if (!comecou) {
                    comecou = true
                    iniciar()
                }
            }
            textos.put(fim)
        }

        fun cancelar() {
            cancelada = true
            textos.clear()
            prontos.clear()
            textos.put(fim)
            principal.post {
                runCatching { tocador?.stop() }
                tocador?.release()
                tocador = null
                voz?.stop()
            }
        }

        private fun iniciar() {
            val chave = preferencias.chaveVoz.takeIf { it.isNotBlank() && it != chaveSemFala }
            val idDaVoz = preferencias.idDaVoz
            var natural = chave != null
            thread(name = "jarvis-voz") {
                var n = 0
                while (true) {
                    val trecho = textos.take()
                    if (trecho == fim || cancelada) break
                    var arquivo: File? = null
                    if (natural && chave != null) {
                        val curto = trecho.length <= 80
                        val destino = File(cacheDir, if (curto) "voz-" + (idDaVoz + "|" + trecho).hashCode() + ".mp3" else "voz-fluxo-${n++ % 6}.mp3")
                        try {
                            if (!(curto && destino.length() > 0)) destino.writeBytes(VozNatural(chave, idDaVoz).sintetizar(trecho))
                            arquivo = destino
                        } catch (e: Exception) {
                            Log.e(TAG, "Voz natural indisponível", e)
                            if (e is FalhaDeServico && e.codigo in 400..499) chaveSemFala = chave
                            Estado.mudar { aviso = "Voz natural indisponível: " + (e.message ?: e.javaClass.simpleName) }
                            // O resto desta resposta sai pela voz do aparelho.
                            natural = false
                        }
                    }
                    prontos.put(arquivo to trecho)
                }
                prontos.put(null to fim)
            }
            thread(name = "jarvis-fala") {
                while (true) {
                    val (arquivo, trecho) = prontos.take()
                    if (trecho == fim || cancelada) break
                    Estado.mudar { fase = Fase.FALANDO }
                    if (arquivo == null || !tocarEEsperar(arquivo)) {
                        if (cancelada) break
                        val dito = CountDownLatch(1)
                        principal.post { falarComOAparelho(trecho) { dito.countDown() } }
                        dito.await(25, TimeUnit.SECONDS)
                    }
                }
                principal.post { if (!encerrado && !cancelada) aoTerminar?.invoke() }
            }
        }
    }

    /** Fala o texto e chama [depois] quando terminar (ou na hora, se não houver voz disponível). */
    private fun falar(texto: String, depois: () -> Unit) {
        if (encerrado) return
        if (texto.isBlank()) {
            principal.post { if (!encerrado) depois() }
            return
        }
        Estado.mudar { fase = Fase.FALANDO }
        val chave = preferencias.chaveVoz
        if (chave.isBlank() || chave == chaveSemFala) falarComOAparelho(texto, depois) else falarComVozNatural(chave, texto, depois)
    }

    /**
     * Voz da ElevenLabs. A resposta é dividida em trechos: o primeiro começa a tocar enquanto os
     * seguintes ainda estão sendo gerados. Se um trecho falhar (sem internet, chave recusada), o
     * resto sai pela voz do aparelho.
     */
    private fun falarComVozNatural(chave: String, texto: String, depois: () -> Unit) {
        val idDaVoz = preferencias.idDaVoz
        val minhaFala = ++falaAtual
        val trechos = Fala.dividir(texto)
        // Cada item é um áudio pronto, ou o texto que sobrou quando a geração falhou; `null` marca o fim.
        val fila = LinkedBlockingQueue<Pair<File?, String?>>()
        thread(name = "jarvis-voz") {
            for ((i, trecho) in trechos.withIndex()) {
                if (encerrado || falaAtual != minhaFala) break
                // Frases curtas se repetem ("Sim, mestre?"): guarda o áudio para não pedir, nem pagar, de novo.
                val curto = trecho.length <= 80
                val arquivo = File(cacheDir, if (curto) "voz-" + (idDaVoz + "|" + trecho).hashCode() + ".mp3" else "voz-trecho-$i.mp3")
                try {
                    if (!(curto && arquivo.length() > 0)) arquivo.writeBytes(VozNatural(chave, idDaVoz).sintetizar(trecho))
                    fila.put(arquivo to null)
                } catch (e: Exception) {
                    Log.e(TAG, "Voz natural indisponível", e)
                    // Recusa por causa da chave, do plano ou da voz não se resolve tentando de novo.
                    if (e is FalhaDeServico && e.codigo in 400..499) chaveSemFala = chave
                    Estado.mudar { aviso = "Voz natural indisponível: " + (e.message ?: e.javaClass.simpleName) }
                    fila.put(null to trechos.drop(i).joinToString(" "))
                    return@thread
                }
            }
            fila.put(null to null)
        }
        thread(name = "jarvis-fala") {
            var tocados = 0
            while (true) {
                val (arquivo, resto) = fila.take()
                if (encerrado || falaAtual != minhaFala) return@thread
                if (arquivo == null) {
                    principal.post {
                        if (encerrado || falaAtual != minhaFala) return@post
                        if (resto != null) falarComOAparelho(resto, depois) else depois()
                    }
                    return@thread
                }
                if (!tocarEEsperar(arquivo)) {
                    // O áudio não tocou: o que falta sai pela voz do aparelho.
                    arquivo.delete()
                    val falta = trechos.drop(tocados).joinToString(" ")
                    principal.post {
                        if (!encerrado && falaAtual == minhaFala) falarComOAparelho(falta, depois)
                    }
                    return@thread
                }
                tocados++
            }
        }
    }

    /** Toca um arquivo de áudio e só volta quando ele termina. Devolve `false` se não conseguiu tocar. */
    private fun tocarEEsperar(arquivo: File): Boolean {
        val fim = CountDownLatch(1)
        var tocou = false
        principal.post {
            try {
                tocador?.release()
                tocador = MediaPlayer().apply {
                    setAudioAttributes(
                        AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
                    )
                    setDataSource(arquivo.absolutePath)
                    setOnCompletionListener { tocou = true; fim.countDown() }
                    setOnErrorListener { _, _, _ -> fim.countDown(); true }
                    prepare()
                    start()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Não consegui tocar a voz natural", e)
                fim.countDown()
            }
        }
        fim.await(90, TimeUnit.SECONDS)
        return tocou
    }

    private fun falarComOAparelho(texto: String, depois: () -> Unit) {
        val motor = voz
        if (motor == null || !vozPronta) {
            principal.post { if (!encerrado) depois() }
            return
        }
        val id = "fala-${++contadorDeFalas}"
        aoTerminarDeFalar[id] = depois
        if (motor.speak(texto, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) falaTerminou(id)
        // Rede de segurança caso o motor de voz nunca avise que terminou.
        principal.postDelayed({ falaTerminou(id) }, 20_000)
    }

    /** A cada cinco minutos, avisa dos compromissos da agenda que começam em até quinze. */
    private fun conferirCompromissos() {
        if (encerrado) return
        principal.postDelayed(::conferirCompromissos, 5 * 60_000L)
        if (!preferencias.avisarCompromissos) return
        if (checkSelfPermission(Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED) return
        thread(name = "jarvis-agenda") {
            try {
                val agora = System.currentTimeMillis()
                val endereco = CalendarContract.Instances.CONTENT_URI.buildUpon().also {
                    ContentUris.appendId(it, agora)
                    ContentUris.appendId(it, agora + 16 * 60_000L)
                }.build()
                val colunas = arrayOf(
                    CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.BEGIN,
                    CalendarContract.Instances.TITLE, CalendarContract.Instances.ALL_DAY,
                )
                contentResolver.query(endereco, colunas, null, null, CalendarContract.Instances.BEGIN + " ASC")?.use { c ->
                    while (c.moveToNext()) {
                        val inicio = c.getLong(1)
                        // Só o que ainda vai começar, e não é de dia inteiro.
                        if (c.getInt(3) == 1 || inicio <= agora) continue
                        val marca = c.getLong(0).toString() + "@" + inicio
                        if (!compromissosAvisados.add(marca)) continue
                        val minutos = ((inicio - agora) / 60_000L).coerceAtLeast(1)
                        val titulo = c.getString(2)?.takeIf { it.isNotBlank() } ?: "um compromisso"
                        principal.post { anunciar("Mestre, em $minutos minutos: $titulo.") }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Não consegui conferir a agenda", e)
            }
        }
    }

    /** Liga ou desliga o modo live: conversa contínua, sem repetir o nome, até a pessoa sair ou se calar. */
    private fun mudarLive(ligar: Boolean) {
        silenciosAoVivo = 0
        val fala = if (ligar) "Modo live ligado, mestre. Pode falar." else "Modo live encerrado, mestre."
        Estado.mudar { aoVivo = ligar; resposta = fala }
        falar(fala) { if (ligar) ouvirComando(continuacao = true) else iniciarEscuta() }
    }

    /** Depois de uma interrupção no meio da tarefa, o que a inteligência ainda disser sai por esta fala nova. */
    private fun substituirFala(nova: FalaContinua) {
        falaSubstituta = nova
    }

    /** Esconde a bolha por um instante, para ela não sair na captura da tela. */
    fun ocultarBolha(ocultar: Boolean) {
        principal.post { bolha.ocultarParaCaptura(ocultar) }
    }

    /** Fala um aviso por conta própria (lembrete, bateria). Se estiver numa conversa, espera ela acabar. */
    private fun anunciar(texto: String, tentativa: Int = 0) {
        if (encerrado) return
        if (Estado.fase == Fase.AGUARDANDO) {
            pararEscuta()
            mostrarPainel()
            Estado.mudar { ouvido = ""; resposta = texto }
            falar(texto) { iniciarEscuta() }
        } else if (tentativa < 8) {
            principal.postDelayed({ anunciar(texto, tentativa + 1) }, 8_000)
        }
    }

    /**
     * Tira uma imagem da tela, com a autorização que a pessoa acabou de dar ([codigo] e [dados]
     * vêm do pedido do sistema). O Android exige que isso rode num serviço em primeiro plano
     * declarado para captura de tela; ao terminar, o serviço volta a ser só de microfone.
     */
    fun capturarTela(codigo: Int, dados: Intent, entregar: (Bitmap?, String?) -> Unit) {
        principal.post {
            var projecao: MediaProjection? = null
            var espelho: VirtualDisplay? = null
            var leitor: ImageReader? = null
            fun encerrarCaptura() {
                bolha.ocultarParaCaptura(false)
                runCatching { espelho?.release() }
                runCatching { leitor?.close() }
                runCatching { projecao?.stop() }
                val fixa = notificacaoFixa
                if (fixa != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !encerrado) {
                    runCatching { startForeground(ID_NOTIFICACAO, fixa, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE) }
                }
            }
            try {
                val fixa = notificacaoFixa ?: throw IllegalStateException("serviço sem notificação")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(
                        ID_NOTIFICACAO, fixa,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                    )
                }
                val p = getSystemService(MediaProjectionManager::class.java).getMediaProjection(codigo, dados)
                    ?: throw IllegalStateException("autorização recusada")
                projecao = p
                p.registerCallback(object : MediaProjection.Callback() {}, principal)
                val medidas = DisplayMetrics()
                @Suppress("DEPRECATION")
                getSystemService(WindowManager::class.java).defaultDisplay.getRealMetrics(medidas)
                val l = ImageReader.newInstance(medidas.widthPixels, medidas.heightPixels, PixelFormat.RGBA_8888, 2)
                leitor = l
                espelho = p.createVirtualDisplay(
                    "jarvis-tela", medidas.widthPixels, medidas.heightPixels, medidas.densityDpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, l.surface, null, principal
                )
                bolha.ocultarParaCaptura(true)
                // Dá tempo de o Jarvis sair da frente e de o primeiro quadro chegar.
                principal.postDelayed({
                    try {
                        val quadro = l.acquireLatestImage() ?: throw IllegalStateException("nenhuma imagem chegou")
                        val plano = quadro.planes[0]
                        val larguraComSobra = plano.rowStride / plano.pixelStride
                        val cheio = Bitmap.createBitmap(larguraComSobra, quadro.height, Bitmap.Config.ARGB_8888)
                        cheio.copyPixelsFromBuffer(plano.buffer)
                        val imagem = Bitmap.createBitmap(cheio, 0, 0, quadro.width, quadro.height)
                        quadro.close()
                        encerrarCaptura()
                        entregar(imagem, null)
                    } catch (e: Exception) {
                        Log.e(TAG, "Captura da tela falhou", e)
                        encerrarCaptura()
                        entregar(null, "Não consegui capturar a tela: ${e.message ?: e.javaClass.simpleName}.")
                    }
                }, 1_000)
            } catch (e: Exception) {
                Log.e(TAG, "Captura da tela não permitida", e)
                encerrarCaptura()
                entregar(null, "O sistema não permitiu capturar a tela: ${e.message ?: e.javaClass.simpleName}.")
            }
        }
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
        private val SAUDACOES = listOf("Sim, mestre?", "Às ordens, mestre.", "Pois não, mestre?", "Estou ouvindo, mestre.")
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
        const val ACAO_ANUNCIAR = "br.jarvis.app.ANUNCIAR"
        const val ACAO_LIVE = "br.jarvis.app.LIVE"
        const val EXTRA_TEXTO = "texto"

        /** O serviço em execução, para a captura de tela pedir a imagem a ele. */
        @Volatile var instancia: JarvisService? = null
            private set

        /** Pede ao Jarvis que fale um aviso (lembrete, bateria). Sem ele ativo, fica só a notificação. */
        fun anunciar(contexto: Context, texto: String) {
            if (rodando) contexto.startService(
                Intent(contexto, JarvisService::class.java).setAction(ACAO_ANUNCIAR).putExtra(EXTRA_TEXTO, texto)
            )
        }

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
