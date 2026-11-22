package br.jarvis.app

import android.Manifest
import android.app.SearchManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.BatteryManager
import android.provider.AlarmClock
import android.provider.ContactsContract
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
data class Resposta(
    val fala: String,
    val depois: Depois = Depois.VOLTAR_A_ESCUTAR,
    /** Algo a fazer só depois de falar (por exemplo, iniciar a ligação). */
    val aoTerminar: (() -> Unit)? = null,
)

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
        is Comando.Mensagem -> mensagem(comando.destino, comando.texto)
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
                "ligar a lanterna, mudar o volume, criar alarmes e temporizadores, ligar e mandar mensagens para seus contatos, e conversar sobre qualquer assunto.",
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
    private fun abrir(intent: Intent): Resposta? {
        bloqueioParaAbrir()?.let { return it }
        return try {
            contexto.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            null
        } catch (e: ActivityNotFoundException) {
            Resposta("Não encontrei um aplicativo para isso.")
        } catch (e: SecurityException) {
            Resposta("O sistema não me deixou abrir isso.")
        }
    }

    /** Se o Android não vai deixar abrir outra tela agora, devolve a resposta que explica o motivo. */
    private fun bloqueioParaAbrir(): Resposta? {
        if (Estado.telaVisivel || Settings.canDrawOverlays(contexto)) return null
        Estado.mudar { aviso = "Para abrir apps com o Jarvis em segundo plano, toque em “Permitir aparecer na tela e abrir apps”." }
        return Resposta("Preciso da permissão para abrir aplicativos em segundo plano. Abra o Jarvis e toque no botão de permissão.")
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

    private data class Contato(val nome: String, val numero: String)

    /** Procura um contato pelo nome falado. Devolve o contato, ou a resposta explicando por que não deu. */
    private fun acharContato(falado: String): Pair<Contato?, Resposta?> {
        if (contexto.checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            Estado.mudar { aviso = "Para ligar ou mandar mensagem pelo nome, toque em “Permitir contatos e ligações”." }
            return null to Resposta("Preciso da permissão de contatos. Abra o Jarvis e toque em permitir contatos e ligações.")
        }
        val contatos = ArrayList<Contato>()
        val colunas = arrayOf(
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
        )
        contexto.contentResolver.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, colunas, null, null, null)?.use { c ->
            while (c.moveToNext()) {
                val nome = c.getString(0) ?: continue
                val numero = c.getString(1) ?: continue
                // Cada pessoa entra uma vez, com o primeiro número cadastrado.
                if (contatos.none { it.nome == nome }) contatos.add(Contato(nome, numero))
            }
        }
        val i = Texto.melhorCorrespondencia(falado, contatos.map { it.nome })
        return if (i >= 0) contatos[i] to null else null to Resposta("Não encontrei $falado nos seus contatos.")
    }

    private fun ligar(destino: String): Resposta {
        val soNumero = destino.none { it.isLetter() } && destino.count { it.isDigit() } >= 3
        val (nome, numero) = if (soNumero) {
            "esse número" to destino.filter { it.isDigit() || it == '+' }
        } else {
            val (contato, problema) = acharContato(destino)
            if (contato == null) return problema!!
            contato.nome to contato.numero
        }
        bloqueioParaAbrir()?.let { return it }
        val endereco = Uri.fromParts("tel", numero, null)
        val podeLigarDireto =
            contexto.checkSelfPermission(Manifest.permission.CALL_PHONE) == PackageManager.PERMISSION_GRANTED
        return if (podeLigarDireto) {
            // Avisa para quem vai ligar antes de discar, para dar tempo de perceber um engano.
            Resposta("Ligando para $nome.", aoTerminar = { abrir(Intent(Intent.ACTION_CALL, endereco)) })
        } else {
            abrir(Intent(Intent.ACTION_DIAL, endereco)) ?: Resposta("Coloquei o número de $nome no telefone. É só tocar para ligar.")
        }
    }

    /** Abre a conversa do WhatsApp com o texto já escrito; o envio fica para a pessoa confirmar. */
    private fun mensagem(destino: String, texto: String): Resposta {
        val (contato, problema) = acharContato(destino)
        if (contato == null) return problema!!
        var numero = contato.numero.filter { it.isDigit() }.trimStart('0')
        // Número sem código do país: assume Brasil.
        if (!contato.numero.trim().startsWith("+") && numero.length <= 11) numero = "55$numero"
        val endereco = Uri.parse("https://wa.me/$numero" + if (texto.isBlank()) "" else "?text=" + Uri.encode(texto))
        val temWhatsApp = try {
            contexto.packageManager.getPackageInfo(WHATSAPP, 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        }
        val intent = Intent(Intent.ACTION_VIEW, endereco)
        if (temWhatsApp) intent.setPackage(WHATSAPP)
        return abrir(intent) ?: Resposta(
            if (texto.isBlank()) "Abri a conversa com ${contato.nome}."
            else "Mensagem para ${contato.nome} pronta no WhatsApp. É só tocar em enviar."
        )
    }

    companion object {
        private const val WHATSAPP = "com.whatsapp"
    }
}
