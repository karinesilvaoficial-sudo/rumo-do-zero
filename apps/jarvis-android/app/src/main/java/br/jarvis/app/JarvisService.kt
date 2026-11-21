package br.jarvis.app

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

        if (!entrarEmPrimeiroPlano()) {
            encerrado = true
            stopSelf()
            return
        }
        rodando = true
        instancia = this
        preferencias.ativo = true
        registerReceiver(aoMudarBateria, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
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
            ACAO_ANUNCIAR -> intent.getStringExtra(EXTRA_TEXTO)?.let { anunciar(it) }
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
        if (instancia === this) {
            instancia = null
            try {
                unregisterReceiver(aoMudarBateria)
            } catch (e: IllegalArgumentException) {
                // O serviço parou antes de registrar.
            }
        }
        tocador?.release()
        tocador = null
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
                    Estado.mudar { resposta = "Parando…" }
                } else aoAtivar()
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
                Depois.OUVIR_DE_NOVO ->
                    if (Roteador.esperaResposta(r.fala)) ouvirComando(continuacao = true) else iniciarEscuta()
                Depois.DESLIGAR -> {
                    preferencias.ativo = false
                    stopSelf()
                }
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
        val mente = cerebro?.takeIf { it.chave == chave }
            ?: Cerebro(this, chave, executor, interrompido = { pararTarefa }).also { cerebro = it }
        Estado.mudar { fase = Fase.PENSANDO; resposta = "" }
        pararTarefa = false
        iniciarEscutaDeInterrupcao()
        thread(name = "jarvis-conversa") {
            val dito = mente.perguntar(texto)
            principal.post {
                if (encerrado) return@post
                pararEscuta()
                Estado.mudar { resposta = dito }
                // Só segue ouvindo se o Jarvis perguntou algo (ou espera um "sim"); senão volta a aguardar o nome.
                falar(dito) {
                    if (Roteador.esperaResposta(dito) || mente.aguardandoConfirmacao) ouvirComando(continuacao = true)
                    else iniciarEscuta()
                }
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
        if (chave.isBlank()) falarComOAparelho(texto, depois) else falarComVozNatural(chave, texto, depois)
    }

    /** Voz da ElevenLabs. Se o áudio não vier (sem internet, chave recusada), fala com a voz do aparelho. */
    private fun falarComVozNatural(chave: String, texto: String, depois: () -> Unit) {
        val idDaVoz = preferencias.idDaVoz
        thread(name = "jarvis-voz") {
            // Frases curtas se repetem ("Sim, mestre?"): guarda o áudio para não pedir, nem pagar, de novo.
            val guardado = File(cacheDir, "voz-" + (idDaVoz + "|" + texto).hashCode() + ".mp3")
            val arquivo = if (texto.length <= 80) guardado else File(cacheDir, "voz-atual.mp3")
            val pronto = try {
                if (!(texto.length <= 80 && arquivo.length() > 0)) arquivo.writeBytes(VozNatural(chave, idDaVoz).sintetizar(texto))
                true
            } catch (e: Exception) {
                Log.e(TAG, "Voz natural indisponível", e)
                Estado.mudar { aviso = "Voz natural indisponível: " + (e.message ?: e.javaClass.simpleName) }
                false
            }
            principal.post {
                if (encerrado) return@post
                if (!pronto) {
                    falarComOAparelho(texto, depois)
                    return@post
                }
                var terminou = false
                fun terminar() {
                    if (terminou) return
                    terminou = true
                    tocador?.release()
                    tocador = null
                    if (!encerrado) depois()
                }
                try {
                    tocador?.release()
                    tocador = MediaPlayer().apply {
                        setAudioAttributes(
                            AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
                        )
                        setDataSource(arquivo.absolutePath)
                        setOnCompletionListener { terminar() }
                        setOnErrorListener { _, _, _ -> terminar(); true }
                        prepare()
                        start()
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Não consegui tocar a voz natural", e)
                    tocador?.release()
                    tocador = null
                    arquivo.delete()
                    falarComOAparelho(texto, depois)
                }
            }
        }
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
