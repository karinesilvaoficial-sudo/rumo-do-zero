package br.jarvis.app

import android.Manifest
import android.animation.ValueAnimator
import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var preferencias: Preferencias
    private lateinit var reator: GloboView
    private lateinit var status: TextView
    private lateinit var ouvido: TextView
    private lateinit var resposta: TextView
    private lateinit var aviso: TextView
    private lateinit var botaoPrincipal: Button
    private lateinit var botaoFalar: Button
    private lateinit var botaoSobrepor: Button
    private lateinit var botaoBateria: Button
    private lateinit var botaoAgenda: Button
    private lateinit var botaoMensagens: Button
    private lateinit var rotuloSensibilidade: TextView

    private val aoMudar: () -> Unit = { atualizar() }
    private var faseAnterior = Fase.PARADO
    private var digitacao: ValueAnimator? = null
    private var respostaMostrada = ""
    private var pedindoDesbloqueio = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Quando o Jarvis é chamado, a tela acende e ele aparece mesmo com o celular bloqueado.
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        setContentView(R.layout.activity_main)
        preferencias = Preferencias(this)

        reator = findViewById(R.id.reator)
        status = findViewById(R.id.status)
        ouvido = findViewById(R.id.ouvido)
        resposta = findViewById(R.id.resposta)
        aviso = findViewById(R.id.aviso)
        botaoPrincipal = findViewById(R.id.botaoPrincipal)
        botaoFalar = findViewById(R.id.botaoFalar)
        botaoSobrepor = findViewById(R.id.botaoSobrepor)
        botaoBateria = findViewById(R.id.botaoBateria)
        botaoAgenda = findViewById(R.id.botaoAgenda)
        botaoMensagens = findViewById(R.id.botaoMensagens)
        rotuloSensibilidade = findViewById(R.id.rotuloSensibilidade)

        botaoPrincipal.setOnClickListener {
            if (JarvisService.rodando) JarvisService.enviar(this, JarvisService.ACAO_PARAR) else ligar()
        }
        botaoFalar.setOnClickListener { JarvisService.enviar(this, JarvisService.ACAO_ATIVAR) }

        val chaveVoz = findViewById<Switch>(R.id.chaveVoz)
        chaveVoz.isChecked = preferencias.voz
        chaveVoz.setOnCheckedChangeListener { _, ligado ->
            preferencias.voz = ligado
            JarvisService.enviar(this, JarvisService.ACAO_RECARREGAR)
        }
        val chavePalmas = findViewById<Switch>(R.id.chavePalmas)
        chavePalmas.isChecked = preferencias.palmas
        chavePalmas.setOnCheckedChangeListener { _, ligado ->
            preferencias.palmas = ligado
            JarvisService.enviar(this, JarvisService.ACAO_RECARREGAR)
        }
        val barra = findViewById<SeekBar>(R.id.sensibilidade)
        barra.progress = preferencias.sensibilidade - 1
        mostrarSensibilidade()
        barra.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(b: SeekBar, valor: Int, doUsuario: Boolean) {
                if (!doUsuario) return
                preferencias.sensibilidade = valor + 1
                mostrarSensibilidade()
            }
            override fun onStartTrackingTouch(b: SeekBar) {}
            override fun onStopTrackingTouch(b: SeekBar) = JarvisService.enviar(this@MainActivity, JarvisService.ACAO_RECARREGAR)
        })

        val campoChave = findViewById<EditText>(R.id.campoChave)
        val estadoChave = findViewById<TextView>(R.id.estadoChave)
        fun mostrarEstadoDaChave() {
            estadoChave.setText(if (preferencias.chaveIa.isEmpty()) R.string.chave_ausente else R.string.chave_salva)
        }
        mostrarEstadoDaChave()
        findViewById<Button>(R.id.botaoSalvarChave).setOnClickListener {
            preferencias.chaveIa = campoChave.text.toString()
            campoChave.text.clear()
            campoChave.clearFocus()
            getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(campoChave.windowToken, 0)
            mostrarEstadoDaChave()
            atualizar()
        }

        // Voz natural (ElevenLabs) e vendas (Cakto): cada chave é colada uma vez e fica só no aparelho.
        val campoChaveVoz = findViewById<EditText>(R.id.campoChaveVoz)
        val campoIdDaVoz = findViewById<EditText>(R.id.campoIdDaVoz)
        val estadoVoz = findViewById<TextView>(R.id.estadoVoz)
        fun mostrarEstadoDaVoz() {
            estadoVoz.setText(if (preferencias.chaveVoz.isEmpty()) R.string.voz_ausente else R.string.voz_salva)
        }
        mostrarEstadoDaVoz()
        campoIdDaVoz.setText(preferencias.idDaVoz)
        findViewById<Button>(R.id.botaoSalvarVoz).setOnClickListener {
            // Campo da chave em branco mantém a chave atual; para remover, use o botão de apagar.
            if (campoChaveVoz.text.isNotBlank()) preferencias.chaveVoz = campoChaveVoz.text.toString()
            preferencias.idDaVoz = campoIdDaVoz.text.toString()
            campoChaveVoz.text.clear()
            esconderTeclado(campoChaveVoz)
            mostrarEstadoDaVoz()
        }
        findViewById<Button>(R.id.botaoApagarVoz).setOnClickListener {
            preferencias.chaveVoz = ""
            mostrarEstadoDaVoz()
        }

        val campoCaktoId = findViewById<EditText>(R.id.campoCaktoId)
        val campoCaktoSegredo = findViewById<EditText>(R.id.campoCaktoSegredo)
        val estadoCakto = findViewById<TextView>(R.id.estadoCakto)
        fun mostrarEstadoDaCakto() {
            estadoCakto.setText(
                if (preferencias.caktoId.isEmpty() || preferencias.caktoSegredo.isEmpty()) R.string.cakto_ausente else R.string.cakto_salva
            )
        }
        mostrarEstadoDaCakto()
        findViewById<Button>(R.id.botaoSalvarCakto).setOnClickListener {
            preferencias.caktoId = campoCaktoId.text.toString()
            preferencias.caktoSegredo = campoCaktoSegredo.text.toString()
            campoCaktoId.text.clear()
            campoCaktoSegredo.text.clear()
            esconderTeclado(campoCaktoSegredo)
            mostrarEstadoDaCakto()
        }

        ativarSePedido(intent)

        botaoSobrepor.setOnClickListener {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        }
        botaoAgenda.setOnClickListener { requestPermissions(PERMISSOES_DA_AGENDA, PEDIDO_AGENDA) }
        botaoMensagens.setOnClickListener {
            // O Android só libera a leitura de notificações por esta tela de configurações.
            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        }
        botaoBateria.setOnClickListener {
            try {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
            } catch (e: Exception) {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        ativarSePedido(intent)
    }

    /** O celular reiniciou e o Jarvis estava ativo: liga a escuta e sai da frente. */
    private fun ativarSePedido(intent: Intent?) {
        if (intent?.getBooleanExtra(ATIVAR, false) != true) return
        intent.removeExtra(ATIVAR)
        if (JarvisService.rodando) return
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return
        JarvisService.iniciar(this)
        moveTaskToBack(true)
    }

    private fun esconderTeclado(campo: EditText) {
        campo.clearFocus()
        getSystemService(InputMethodManager::class.java).hideSoftInputFromWindow(campo.windowToken, 0)
    }

    override fun onStart() {
        super.onStart()
        Estado.telaVisivel = true
        Estado.observar(aoMudar)
        atualizar()
    }

    override fun onStop() {
        Estado.pararDeObservar(aoMudar)
        Estado.telaVisivel = false
        super.onStop()
    }

    override fun onResume() {
        super.onResume()
        atualizar()
    }

    private fun mostrarSensibilidade() {
        rotuloSensibilidade.text = getString(R.string.sensibilidade) + ": " + preferencias.sensibilidade
    }

    private fun ligar() {
        val faltando = ArrayList<String>()
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
            faltando.add(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) faltando.add(Manifest.permission.POST_NOTIFICATIONS)

        if (faltando.isEmpty()) JarvisService.iniciar(this)
        else requestPermissions(faltando.toTypedArray(), PEDIDO_PERMISSOES)
    }

    override fun onRequestPermissionsResult(codigo: Int, permissoes: Array<out String>, resultados: IntArray) {
        super.onRequestPermissionsResult(codigo, permissoes, resultados)
        if (codigo == PEDIDO_AGENDA) {
            if (!temAgenda()) Estado.mudar { aviso = "Sem esse acesso o Jarvis não vê a agenda nem os contatos, e não liga sozinho. Se o botão não abrir mais o pedido, libere em Configurações > Apps > Jarvis > Permissões." }
            atualizar()
            return
        }
        if (codigo != PEDIDO_PERMISSOES) return
        // Só o microfone é indispensável; sem notificações o Jarvis funciona, apenas sem o aviso na barra.
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            JarvisService.iniciar(this)
        } else {
            Estado.mudar { aviso = "Sem a permissão do microfone o Jarvis não consegue ouvir. Libere em Configurações > Apps > Jarvis > Permissões." }
        }
    }

    /** Abre o app que ficou esperando o desbloqueio do celular (ver Executor.abrir). */
    private fun abrirPendente() {
        val pendente = Estado.aAbrir ?: return
        val guarda = getSystemService(KeyguardManager::class.java)
        fun abrirAgora() {
            val intent = Estado.aAbrir ?: return
            Estado.aAbrir = null
            try {
                startActivity(intent)
            } catch (e: Exception) {
                Estado.mudar { aviso = "Não consegui abrir o aplicativo depois do desbloqueio." }
            }
        }
        if (!guarda.isKeyguardLocked) {
            abrirAgora()
            return
        }
        if (pedindoDesbloqueio) return
        pedindoDesbloqueio = true
        // Sem senha, o bloqueio some sozinho; com senha ou digital, o Android pede e só então continua.
        guarda.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
            override fun onDismissSucceeded() {
                pedindoDesbloqueio = false
                abrirAgora()
            }
            override fun onDismissCancelled() {
                pedindoDesbloqueio = false
                Estado.aAbrir = null
            }
            override fun onDismissError() {
                pedindoDesbloqueio = false
                Estado.aAbrir = null
            }
        })
    }

    private fun atualizar() {
        abrirPendente()
        val fase = Estado.fase
        reator.fase = fase
        // Saiu de "aguardando" para ouvir ou falar: foi chamado.
        if (faseAnterior == Fase.AGUARDANDO && (fase == Fase.FALANDO || fase == Fase.OUVINDO)) reator.chamar()
        faseAnterior = fase
        trocarTexto(status, when (fase) {
            Fase.PARADO -> "Desativado"
            Fase.CARREGANDO -> "Preparando a escuta…"
            Fase.AGUARDANDO -> "Aguardando você chamar"
            Fase.OUVINDO -> "Ouvindo…"
            Fase.PENSANDO -> "Pensando…"
            Fase.FALANDO -> "Respondendo…"
        })
        trocarTexto(ouvido, if (Estado.ouvido.isEmpty()) "" else "“${Estado.ouvido}”")
        digitar(Estado.resposta)
        aviso.text = Estado.aviso
        aviso.visibility = if (Estado.aviso.isEmpty()) View.GONE else View.VISIBLE

        val ligado = fase != Fase.PARADO
        botaoPrincipal.setText(if (ligado) R.string.parar else R.string.iniciar)
        botaoFalar.visibility = if (fase == Fase.AGUARDANDO) View.VISIBLE else View.GONE

        botaoSobrepor.visibility = if (Settings.canDrawOverlays(this)) View.GONE else View.VISIBLE
        // Agenda, contatos e mensagens só servem à inteligência: os botões aparecem depois de salvar a chave.
        val comInteligencia = preferencias.chaveIa.isNotEmpty()
        botaoAgenda.visibility = if (comInteligencia && !temAgenda()) View.VISIBLE else View.GONE
        botaoMensagens.visibility = if (comInteligencia && !Caixa.acessoLiberado(this)) View.VISIBLE else View.GONE
        val energia = getSystemService(PowerManager::class.java)
        botaoBateria.visibility =
            if (energia.isIgnoringBatteryOptimizations(packageName)) View.GONE else View.VISIBLE
    }

    private fun temAgenda() = PERMISSOES_DA_AGENDA.all { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }

    /** Troca o texto com uma passagem rápida, para a mudança de estado ser percebida. */
    private fun trocarTexto(campo: TextView, novo: String) {
        // `tag` guarda o texto a caminho, para não reiniciar a passagem a cada atualização.
        if ((campo.tag ?: campo.text.toString()) == novo) return
        campo.tag = novo
        campo.animate().cancel()
        if (!ValueAnimator.areAnimatorsEnabled() || campo.text.isEmpty()) {
            campo.text = novo
            campo.alpha = 1f
            return
        }
        campo.animate().alpha(0f).setDuration(110).withEndAction {
            campo.text = novo
            campo.animate().alpha(1f).setDuration(180)
        }
    }

    /** Escreve a resposta letra a letra, acompanhando o início da fala. */
    private fun digitar(texto: String) {
        if (texto == respostaMostrada) return
        respostaMostrada = texto
        digitacao?.cancel()
        if (texto.isEmpty() || !ValueAnimator.areAnimatorsEnabled()) {
            resposta.text = texto
            return
        }
        digitacao = ValueAnimator.ofInt(0, texto.length).apply {
            duration = (texto.length * 22L).coerceIn(200L, 1800L)
            addUpdateListener { resposta.text = texto.substring(0, it.animatedValue as Int) }
            start()
        }
    }

    companion object {
        const val ATIVAR = "ativar"
        private const val PEDIDO_PERMISSOES = 10
        private const val PEDIDO_AGENDA = 11
        private val PERMISSOES_DA_AGENDA = arrayOf(
            Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR, Manifest.permission.READ_CONTACTS,
            Manifest.permission.CALL_PHONE,
        )
    }
}
