package br.jarvis.app

import android.app.SearchManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.BatteryManager
import android.provider.AlarmClock
import android.provider.MediaStore
import android.provider.Settings
import br.jarvis.core.AcaoVolume
import br.jarvis.core.Comando
import br.jarvis.core.Texto
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** O que o Jarvis responde e o que faz depois de falar. */
data class Resposta(val fala: String, val depois: Depois = Depois.VOLTAR_A_ESCUTAR)

enum class Depois {
    VOLTAR_A_ESCUTAR,
    /** Continua a conversa: ouve a próxima fala sem precisar chamar de novo. */
    OUVIR_DE_NOVO,
    DESLIGAR,
}

/** Executa no aparelho o comando que foi entendido. */
class Executor(private val contexto: Context) {
    private val brasil = Locale("pt", "BR")

    private data class App(val nome: String, val pacote: String, val classe: String)

    fun executar(comando: Comando): Resposta = when (comando) {
        is Comando.AbrirApp -> abrirApp(comando.nome)
        Comando.AbrirJarvis -> {
            abrir(Intent(contexto, MainActivity::class.java)) ?: Resposta("Estou aqui.")
        }
        Comando.Horas -> {
            val agora = Calendar.getInstance()
            val h = agora.get(Calendar.HOUR_OF_DAY)
            val m = agora.get(Calendar.MINUTE)
            val horas = if (h == 1) "É 1 hora" else "São $h horas"
            Resposta(if (m == 0) "$horas." else "$horas e $m.")
        }
        Comando.Data -> Resposta("Hoje é " + SimpleDateFormat("EEEE, d 'de' MMMM 'de' yyyy", brasil).format(Date()) + ".")
        Comando.Bateria -> {
            val nivel = contexto.getSystemService(BatteryManager::class.java)
                .getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            Resposta("A bateria está em $nivel por cento.")
        }
        is Comando.Pesquisar -> pesquisar(comando.termo)
        is Comando.TocarNoYoutube -> tocarNoYoutube(comando.termo)
        is Comando.Lanterna -> lanterna(comando.ligar)
        is Comando.Volume -> volume(comando.acao)
        is Comando.Temporizador -> temporizador(comando.segundos)
        is Comando.Alarme -> alarme(comando.hora, comando.minuto)
        is Comando.Ligar -> ligar(comando.destino)
        Comando.Saudacao -> {
            val h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
            val periodo = when {
                h < 5 -> "Boa noite"
                h < 12 -> "Bom dia"
                h < 18 -> "Boa tarde"
                else -> "Boa noite"
            }
            Resposta("$periodo. Em que posso ajudar?", Depois.OUVIR_DE_NOVO)
        }
        Comando.Agradecimento -> Resposta("Disponha.")
        Comando.Ajuda -> Resposta(
            "Posso abrir aplicativos, dizer as horas, pesquisar na internet, tocar músicas no YouTube, " +
                "ligar a lanterna, mudar o volume, criar alarmes e temporizadores, e conversar sobre qualquer assunto. " +
                "Com a chave da inteligência, também vejo sua agenda, leio as mensagens que chegam e respondo no WhatsApp.",
            Depois.OUVIR_DE_NOVO
        )
        Comando.Desligar -> Resposta("Até logo.", Depois.DESLIGAR)
        Comando.Cancelar -> Resposta("Certo.")
        is Comando.Desconhecido -> Resposta("Não entendi. Diga ajuda para saber o que eu faço.", Depois.OUVIR_DE_NOVO)
        Comando.Vazio -> Resposta("Não ouvi nada.")
    }

    private fun listarApps(): List<App> {
        val pm = contexto.packageManager
        val consulta = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        return pm.queryIntentActivities(consulta, 0).map {
            App(it.loadLabel(pm).toString(), it.activityInfo.packageName, it.activityInfo.name)
        }
    }

    /** Existe um app instalado com esse nome? Serve para "YouTube", dito sozinho, abrir o YouTube. */
    fun conheceApp(nome: String): Boolean = acharApp(nome) != null

    private fun acharApp(nome: String): App? {
        val apps = listarApps()
        val i = Texto.melhorCorrespondencia(nome, apps.map { it.nome })
        return if (i >= 0) apps[i] else null
    }

    /** Nomes genéricos que funcionam em qualquer aparelho, mesmo que o app tenha outro nome. */
    private fun atalho(nome: String): Intent? = when (Texto.normalizar(nome)) {
        "camera" -> Intent(MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA)
        "configuracoes", "configuracao", "ajustes" -> Intent(Settings.ACTION_SETTINGS)
        "telefone", "discador" -> Intent(Intent.ACTION_DIAL)
        "navegador", "internet" -> Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com"))
        "wifi", "wi fi" -> Intent(Settings.ACTION_WIFI_SETTINGS)
        "bluetooth" -> Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
        else -> null
    }

    private fun abrirApp(nome: String): Resposta {
        val app = acharApp(nome)
        if (app != null) {
            val intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
                .setClassName(app.pacote, app.classe)
            return abrir(intent) ?: Resposta("Abrindo ${app.nome}.")
        }
        val generico = atalho(nome)
        if (generico != null) return abrir(generico) ?: Resposta("Abrindo $nome.")
        return Resposta("Não encontrei o aplicativo $nome.")
    }

    /**
     * Abre uma tela. Devolve `null` se deu certo, ou a resposta explicando o problema.
     * Fora da tela do Jarvis, o Android só deixa abrir outras telas com a permissão de sobrepor.
     */
    internal fun abrir(intent: Intent): Resposta? {
        if (!Estado.telaVisivel && !Settings.canDrawOverlays(contexto)) {
            Estado.mudar { aviso = "Para abrir apps com o Jarvis em segundo plano, toque em “Permitir aparecer na tela e abrir apps”." }
            return Resposta("Preciso da permissão para abrir aplicativos em segundo plano. Abra o Jarvis e toque no botão de permissão.")
        }
        return try {
            contexto.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            null
        } catch (e: ActivityNotFoundException) {
            Resposta("Não encontrei um aplicativo para isso.")
        } catch (e: SecurityException) {
            Resposta("O sistema não me deixou abrir isso.")
        }
    }

    private fun pesquisar(termo: String): Resposta {
        val busca = Intent(Intent.ACTION_WEB_SEARCH).putExtra(SearchManager.QUERY, termo)
        val pronto = if (busca.resolveActivity(contexto.packageManager) != null) abrir(busca)
        else abrir(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=" + Uri.encode(termo))))
        return pronto ?: Resposta("Pesquisando $termo.")
    }

    private fun tocarNoYoutube(termo: String): Resposta {
        val endereco = Uri.parse("https://www.youtube.com/results?search_query=" + Uri.encode(termo))
        return abrir(Intent(Intent.ACTION_VIEW, endereco)) ?: Resposta("Procurando $termo no YouTube.")
    }

    private fun lanterna(ligar: Boolean): Resposta {
        val cameras = contexto.getSystemService(CameraManager::class.java)
        return try {
            val comFlash = cameras.cameraIdList.firstOrNull {
                cameras.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            } ?: return Resposta("Este aparelho não tem lanterna.")
            cameras.setTorchMode(comFlash, ligar)
            Resposta(if (ligar) "Lanterna ligada." else "Lanterna desligada.")
        } catch (e: Exception) {
            Resposta("Não consegui usar a lanterna agora.")
        }
    }

    private fun volume(acao: AcaoVolume): Resposta {
        val audio = contexto.getSystemService(AudioManager::class.java)
        val musica = AudioManager.STREAM_MUSIC
        val maximo = audio.getStreamMaxVolume(musica)
        val atual = audio.getStreamVolume(musica)
        val passo = maxOf(1, maximo / 5)
        val (novo, fala) = when (acao) {
            AcaoVolume.AUMENTAR -> minOf(maximo, atual + passo) to "Volume aumentado."
            AcaoVolume.DIMINUIR -> maxOf(1, atual - passo) to "Volume reduzido."
            AcaoVolume.MAXIMO -> maximo to "Volume no máximo."
            AcaoVolume.MUDO -> 0 to ""
        }
        return try {
            audio.setStreamVolume(musica, novo, AudioManager.FLAG_SHOW_UI)
            Resposta(fala)
        } catch (e: SecurityException) {
            Resposta("O modo não perturbe está impedindo a mudança de volume.")
        }
    }

    private fun temporizador(segundos: Int): Resposta {
        val intent = Intent(AlarmClock.ACTION_SET_TIMER)
            .putExtra(AlarmClock.EXTRA_LENGTH, segundos)
            .putExtra(AlarmClock.EXTRA_MESSAGE, "Jarvis")
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        return abrir(intent) ?: Resposta("Temporizador de ${duracaoFalada(segundos)} iniciado.")
    }

    private fun duracaoFalada(segundos: Int): String {
        val h = segundos / 3600
        val m = segundos % 3600 / 60
        val s = segundos % 60
        val partes = ArrayList<String>()
        if (h > 0) partes.add(if (h == 1) "1 hora" else "$h horas")
        if (m > 0) partes.add(if (m == 1) "1 minuto" else "$m minutos")
        if (s > 0) partes.add(if (s == 1) "1 segundo" else "$s segundos")
        return partes.joinToString(" e ")
    }

    private fun alarme(hora: Int, minuto: Int): Resposta {
        val intent = Intent(AlarmClock.ACTION_SET_ALARM)
            .putExtra(AlarmClock.EXTRA_HOUR, hora)
            .putExtra(AlarmClock.EXTRA_MINUTES, minuto)
            .putExtra(AlarmClock.EXTRA_MESSAGE, "Jarvis")
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
        val horario = if (minuto == 0) "$hora horas" else "$hora e $minuto"
        return abrir(intent) ?: Resposta("Alarme criado para $horario.")
    }

    private fun ligar(destino: String): Resposta {
        val numero = destino.filter { it.isDigit() }
        // Só abre o discador: a ligação em si fica para a pessoa confirmar.
        return if (numero.length >= 3) {
            abrir(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$numero"))) ?: Resposta("Número pronto no telefone.")
        } else {
            abrir(Intent(Intent.ACTION_DIAL))
                ?: Resposta("Abri o telefone. Ainda não sei procurar contatos pelo nome.")
        }
    }
}
