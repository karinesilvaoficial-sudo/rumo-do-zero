package br.jarvis.app

import android.Manifest
import android.animation.ValueAnimator
import android.app.Activity
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
    private lateinit var reator: ReatorView
    private lateinit var status: TextView
    private lateinit var ouvido: TextView
    private lateinit var resposta: TextView
    private lateinit var aviso: TextView
    private lateinit var botaoPrincipal: Button
    private lateinit var botaoFalar: Button
    private lateinit var botaoSobrepor: Button
    private lateinit var botaoBateria: Button
    private lateinit var rotuloSensibilidade: TextView

    private val aoMudar: () -> Unit = { atualizar() }
    private var faseAnterior = Fase.PARADO
    private var digitacao: ValueAnimator? = null
    private var respostaMostrada = ""

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
        }

        botaoSobrepor.setOnClickListener {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
        }
        botaoBateria.setOnClickListener {
            try {
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
            } catch (e: Exception) {
                startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
            }
        }
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
        if (codigo != PEDIDO_PERMISSOES) return
        // Só o microfone é indispensável; sem notificações o Jarvis funciona, apenas sem o aviso na barra.
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            JarvisService.iniciar(this)
        } else {
            Estado.mudar { aviso = "Sem a permissão do microfone o Jarvis não consegue ouvir. Libere em Configurações > Apps > Jarvis > Permissões." }
        }
    }

    private fun atualizar() {
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
        val energia = getSystemService(PowerManager::class.java)
        botaoBateria.visibility =
            if (energia.isIgnoringBatteryOptimizations(packageName)) View.GONE else View.VISIBLE
    }

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
        private const val PEDIDO_PERMISSOES = 10
    }
}
