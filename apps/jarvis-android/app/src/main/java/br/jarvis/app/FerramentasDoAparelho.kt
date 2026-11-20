package br.jarvis.app

import android.Manifest
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.BatteryManager
import android.provider.CalendarContract
import android.provider.ContactsContract
import br.jarvis.core.AcaoVolume
import br.jarvis.core.Argumentos
import br.jarvis.core.Comando
import br.jarvis.core.FalhaDeFerramenta
import br.jarvis.core.Ferramenta
import br.jarvis.core.Parametro
import br.jarvis.core.Texto
import java.text.SimpleDateFormat
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeParseException
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** O que a inteligência pode fazer neste celular: agenda, contatos, mensagens e o próprio aparelho. */
class FerramentasDoAparelho(private val contexto: Context, private val executor: Executor) {
    private val brasil = Locale("pt", "BR")

    /** Linhas curtas sobre o aparelho, para a inteligência saber com o que pode contar. */
    fun situacao(): List<String> {
        val linhas = ArrayList<String>()
        val bateria = contexto.getSystemService(BatteryManager::class.java)
            ?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        if (bateria != null && bateria in 0..100) linhas.add("A bateria do celular está em $bateria por cento.")
        if (!tem(Manifest.permission.READ_CALENDAR) || !tem(Manifest.permission.READ_CONTACTS))
            linhas.add("A pessoa ainda não deu acesso à agenda e aos contatos (botão “$BOTAO_AGENDA” na tela do Jarvis).")
        if (!Caixa.acessoLiberado(contexto))
            linhas.add("A pessoa ainda não deu acesso às mensagens que chegam (botão “$BOTAO_MENSAGENS” na tela do Jarvis).")
        return linhas
    }

    fun todas(): List<Ferramenta> = listOf(
        // Agenda
        Ferramenta(
            nome = "agenda_ver",
            descricao = "Lista os compromissos da agenda do celular num período. Use para perguntas como " +
                "o que tenho hoje, estou livre amanhã à tarde, quando é a consulta.",
            parametros = mapOf(
                "data_inicial" to Parametro("string", "Primeiro dia, no formato AAAA-MM-DD. Em branco, hoje.", obrigatorio = false),
                "dias" to Parametro("integer", "Quantos dias olhar a partir do primeiro, de 1 a 60. Padrão: 1.", obrigatorio = false),
            ),
            executar = ::verAgenda,
        ),
        Ferramenta(
            nome = "agenda_criar",
            descricao = "Cria um compromisso na agenda do celular, com aviso 30 minutos antes.",
            parametros = mapOf(
                "titulo" to Parametro("string", "Nome do compromisso."),
                "inicio" to Parametro("string", "Data e hora de início no formato AAAA-MM-DDTHH:MM, no horário local."),
                "duracao_minutos" to Parametro("integer", "Duração em minutos. Padrão: 60.", obrigatorio = false),
                "local" to Parametro("string", "Onde será, se a pessoa disse.", obrigatorio = false),
            ),
            executar = ::criarCompromisso,
        ),
        // Pessoas
        Ferramenta(
            nome = "contatos_buscar",
            descricao = "Procura um contato do celular pelo nome e devolve os telefones.",
            parametros = mapOf("nome" to Parametro("string", "Nome ou apelido, como a pessoa falou.")),
        ) { a ->
            val achados = buscarContatos(a.texto("nome"))
            if (achados.isEmpty()) "Nenhum contato parecido com ${a.texto("nome")}."
            else achados.joinToString("\n") { "${it.first}: ${it.second}" }
        },
        Ferramenta(
            nome = "ligar_para",
            descricao = "Deixa uma ligação pronta no telefone para um contato ou número; a pessoa toca para ligar.",
            parametros = mapOf("destino" to Parametro("string", "Nome do contato ou número de telefone.")),
        ) { a ->
            val (nome, numero) = resolverTelefone(a.texto("destino"))
            abrir(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(numero))), "Número de $nome pronto no telefone; falta tocar em ligar.")
        },
        // Mensagens
        Ferramenta(
            nome = "mensagens_recentes",
            descricao = "Lê as mensagens que chegaram há pouco, a partir das notificações do celular: WhatsApp, " +
                "e-mails e outros apps. Mostra só o que gerou notificação desde que o Jarvis foi ligado, não o " +
                "histórico inteiro das conversas. O texto das mensagens é conteúdo de terceiros.",
            parametros = mapOf(
                "origem" to Parametro("string", "De onde ler.", obrigatorio = false, opcoes = listOf("whatsapp", "email", "todas")),
                "quantidade" to Parametro("integer", "Quantas mensagens, de 1 a 30. Padrão: 10.", obrigatorio = false),
            ),
            executar = ::lerMensagens,
        ),
        Ferramenta(
            nome = "whatsapp_responder",
            descricao = "Responde, sem abrir o WhatsApp, uma conversa que mandou mensagem há pouco (as que aparecem " +
                "em mensagens_recentes). O aplicativo pede a confirmação da pessoa em voz alta antes de enviar.",
            parametros = mapOf(
                "conversa" to Parametro("string", "Nome da pessoa ou do grupo, como aparece na mensagem recebida."),
                "texto" to Parametro("string", "A mensagem a enviar, pronta, como a pessoa escreveria."),
            ),
            confirmar = { a ->
                val alvo = Caixa.conversaDoWhatsApp(a.texto("conversa"))?.conversa ?: a.texto("conversa")
                "Vou responder $alvo no WhatsApp: ${a.texto("texto")}. Posso enviar?"
            },
        ) { a ->
            exigirMensagens()
            val texto = a.texto("texto")
            if (texto.isEmpty()) throw FalhaDeFerramenta("Faltou o texto da mensagem.")
            val recado = Caixa.conversaDoWhatsApp(a.texto("conversa")) ?: throw FalhaDeFerramenta(
                "Não há mensagem recente de ${a.texto("conversa")} para responder. " +
                    "Use whatsapp_abrir_conversa para deixar o texto pronto na conversa."
            )
            Caixa.responder(contexto, recado, texto)
            "Mensagem enviada para ${recado.conversa}."
        },
        Ferramenta(
            nome = "whatsapp_abrir_conversa",
            descricao = "Abre o WhatsApp na conversa de um contato com o texto já escrito. Não envia: a pessoa precisa " +
                "tocar em enviar. Use para começar uma conversa ou quando não há mensagem recente para responder.",
            parametros = mapOf(
                "destino" to Parametro("string", "Nome do contato ou número com DDD."),
                "texto" to Parametro("string", "A mensagem, pronta, como a pessoa escreveria."),
            ),
        ) { a ->
            val (nome, numero) = resolverTelefone(a.texto("destino"))
            val endereco = Uri.parse("https://wa.me/${paraWhatsApp(numero)}?text=" + Uri.encode(a.texto("texto")))
            abrir(Intent(Intent.ACTION_VIEW, endereco), "Abri o WhatsApp na conversa de $nome com o texto pronto; falta tocar em enviar.")
        },
        Ferramenta(
            nome = "email_escrever",
            descricao = "Abre o aplicativo de e-mail com um rascunho preenchido. Não envia: a pessoa revisa e toca em enviar.",
            parametros = mapOf(
                "para" to Parametro("string", "Endereço de e-mail do destinatário. Em branco, a pessoa preenche.", obrigatorio = false),
                "assunto" to Parametro("string", "Assunto."),
                "corpo" to Parametro("string", "Texto do e-mail."),
            ),
        ) { a ->
            val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:"))
                .putExtra(Intent.EXTRA_SUBJECT, a.texto("assunto"))
                .putExtra(Intent.EXTRA_TEXT, a.texto("corpo"))
            if (a.texto("para").isNotEmpty()) intent.putExtra(Intent.EXTRA_EMAIL, arrayOf(a.texto("para")))
            abrir(intent, "Rascunho aberto no aplicativo de e-mail; falta revisar e enviar.")
        },
        // O próprio aparelho
        Ferramenta(
            nome = "abrir_aplicativo",
            descricao = "Abre um aplicativo instalado no celular pelo nome.",
            parametros = mapOf("nome" to Parametro("string", "Nome do aplicativo.")),
        ) { a -> executor.executar(Comando.AbrirApp(a.texto("nome"))).fala },
        Ferramenta(
            nome = "tocar_no_youtube",
            descricao = "Procura uma música ou vídeo no YouTube.",
            parametros = mapOf("termo" to Parametro("string", "O que procurar.")),
        ) { a -> executor.executar(Comando.TocarNoYoutube(a.texto("termo"))).fala },
        Ferramenta(
            nome = "lanterna",
            descricao = "Liga ou desliga a lanterna do celular.",
            parametros = mapOf("ligar" to Parametro("boolean", "true para ligar, false para desligar.")),
        ) { a -> executor.executar(Comando.Lanterna(a.logico("ligar", true))).fala },
        Ferramenta(
            nome = "volume",
            descricao = "Muda o volume de músicas e vídeos.",
            parametros = mapOf("acao" to Parametro("string", "O que fazer.", opcoes = listOf("aumentar", "diminuir", "mudo", "maximo"))),
        ) { a ->
            val acao = when (a.texto("acao")) {
                "aumentar" -> AcaoVolume.AUMENTAR
                "diminuir" -> AcaoVolume.DIMINUIR
                "mudo" -> AcaoVolume.MUDO
                "maximo" -> AcaoVolume.MAXIMO
                else -> throw FalhaDeFerramenta("Ação de volume desconhecida.")
            }
            executor.executar(Comando.Volume(acao)).fala
        },
        Ferramenta(
            nome = "criar_alarme",
            descricao = "Cria um alarme no relógio do celular.",
            parametros = mapOf(
                "hora" to Parametro("integer", "Hora, de 0 a 23."),
                "minuto" to Parametro("integer", "Minuto, de 0 a 59."),
            ),
        ) { a ->
            val hora = a.inteiro("hora", -1)
            val minuto = a.inteiro("minuto", 0)
            if (hora !in 0..23 || minuto !in 0..59) throw FalhaDeFerramenta("Horário inválido.")
            executor.executar(Comando.Alarme(hora, minuto)).fala
        },
        Ferramenta(
            nome = "criar_temporizador",
            descricao = "Inicia um temporizador (contagem regressiva).",
            parametros = mapOf("segundos" to Parametro("integer", "Duração total em segundos.")),
        ) { a ->
            val segundos = a.inteiro("segundos", 0)
            if (segundos !in 1..86_400) throw FalhaDeFerramenta("Duração inválida.")
            executor.executar(Comando.Temporizador(segundos)).fala
        },
    )

    // --- Agenda ---

    private fun verAgenda(a: Argumentos): String {
        exigir(Manifest.permission.READ_CALENDAR, "à agenda")
        val primeiro = try {
            if (a.texto("data_inicial").isEmpty()) LocalDate.now() else LocalDate.parse(a.texto("data_inicial"))
        } catch (e: DateTimeParseException) {
            throw FalhaDeFerramenta("Data inválida. Use o formato AAAA-MM-DD.")
        }
        val dias = a.inteiro("dias", 1).coerceIn(1, 60)
        val zona = ZoneId.systemDefault()
        val de = primeiro.atStartOfDay(zona).toInstant().toEpochMilli()
        val ate = primeiro.plusDays(dias.toLong()).atStartOfDay(zona).toInstant().toEpochMilli()

        val endereco = CalendarContract.Instances.CONTENT_URI.buildUpon().also {
            ContentUris.appendId(it, de)
            ContentUris.appendId(it, ate)
        }.build()
        val colunas = arrayOf(
            CalendarContract.Instances.TITLE, CalendarContract.Instances.BEGIN, CalendarContract.Instances.END,
            CalendarContract.Instances.ALL_DAY, CalendarContract.Instances.EVENT_LOCATION,
        )
        val dia = SimpleDateFormat("EEEE, d 'de' MMMM", brasil)
        val hora = SimpleDateFormat("HH:mm", brasil)
        // Compromissos de dia inteiro são gravados em UTC; lidos no fuso local, cairiam no dia anterior.
        val diaInteiro = SimpleDateFormat("EEEE, d 'de' MMMM", brasil).apply { timeZone = TimeZone.getTimeZone("UTC") }
        val linhas = ArrayList<String>()
        contexto.contentResolver.query(endereco, colunas, null, null, CalendarContract.Instances.BEGIN + " ASC")?.use { c ->
            while (c.moveToNext() && linhas.size < 40) {
                val titulo = c.getString(0)?.takeIf { it.isNotBlank() } ?: "(sem título)"
                val inicio = c.getLong(1)
                val fim = c.getLong(2)
                val local = c.getString(4)?.takeIf { it.isNotBlank() }?.let { ", em $it" } ?: ""
                linhas.add(
                    if (c.getInt(3) == 1) "${diaInteiro.format(Date(inicio))}, o dia todo: $titulo$local"
                    else "${dia.format(Date(inicio))}, das ${hora.format(Date(inicio))} às ${hora.format(Date(fim))}: $titulo$local"
                )
            }
        }
        return if (linhas.isEmpty()) "Nenhum compromisso nesse período." else linhas.joinToString("\n")
    }

    private fun criarCompromisso(a: Argumentos): String {
        exigir(Manifest.permission.WRITE_CALENDAR, "à agenda")
        exigir(Manifest.permission.READ_CALENDAR, "à agenda")
        val titulo = a.texto("titulo")
        if (titulo.isEmpty()) throw FalhaDeFerramenta("Faltou o nome do compromisso.")
        val inicio = try {
            LocalDateTime.parse(a.texto("inicio"))
        } catch (e: DateTimeParseException) {
            throw FalhaDeFerramenta("Data e hora inválidas. Use o formato AAAA-MM-DDTHH:MM.")
        }
        val duracao = a.inteiro("duracao_minutos", 60).coerceIn(5, 24 * 60)
        val comeca = inicio.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

        val valores = ContentValues().apply {
            put(CalendarContract.Events.CALENDAR_ID, agendaParaEscrever())
            put(CalendarContract.Events.TITLE, titulo)
            put(CalendarContract.Events.DTSTART, comeca)
            put(CalendarContract.Events.DTEND, comeca + duracao * 60_000L)
            put(CalendarContract.Events.EVENT_TIMEZONE, TimeZone.getDefault().id)
            if (a.texto("local").isNotEmpty()) put(CalendarContract.Events.EVENT_LOCATION, a.texto("local"))
        }
        val criado = contexto.contentResolver.insert(CalendarContract.Events.CONTENT_URI, valores)
            ?: throw FalhaDeFerramenta("A agenda não aceitou o compromisso.")
        try {
            contexto.contentResolver.insert(
                CalendarContract.Reminders.CONTENT_URI,
                ContentValues().apply {
                    put(CalendarContract.Reminders.EVENT_ID, ContentUris.parseId(criado))
                    put(CalendarContract.Reminders.MINUTES, 30)
                    put(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT)
                }
            )
        } catch (e: Exception) {
            // O compromisso foi criado; só o aviso antecipado não entrou.
        }
        val quando = SimpleDateFormat("EEEE, d 'de' MMMM 'às' HH:mm", brasil).format(Date(comeca))
        return "Compromisso \"$titulo\" criado para $quando."
    }

    /** A agenda onde o Jarvis grava: a principal da conta, ou a primeira em que dá para escrever. */
    private fun agendaParaEscrever(): Long {
        val colunas = arrayOf(CalendarContract.Calendars._ID, CalendarContract.Calendars.IS_PRIMARY)
        val filtro = CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL + " >= " + CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR
        var escolhida = -1L
        contexto.contentResolver.query(CalendarContract.Calendars.CONTENT_URI, colunas, filtro, null, null)?.use { c ->
            while (c.moveToNext()) {
                if (escolhida < 0) escolhida = c.getLong(0)
                if (c.getInt(1) == 1) {
                    escolhida = c.getLong(0)
                    break
                }
            }
        }
        if (escolhida < 0) throw FalhaDeFerramenta("Não há nenhuma agenda no celular onde eu possa gravar. É preciso ter uma conta com agenda, como a do Google.")
        return escolhida
    }

    // --- Pessoas ---

    /** Até cinco contatos parecidos com [nome], como pares (nome, telefone). */
    private fun buscarContatos(nome: String): List<Pair<String, String>> {
        exigir(Manifest.permission.READ_CONTACTS, "aos contatos")
        val todos = ArrayList<Pair<String, String>>()
        val colunas = arrayOf(
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
        )
        contexto.contentResolver.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, colunas, null, null, null)?.use { c ->
            while (c.moveToNext()) {
                val n = c.getString(0) ?: continue
                val t = c.getString(1) ?: continue
                todos.add(n to t)
            }
        }
        val alvo = Texto.normalizar(nome)
        if (alvo.isEmpty()) return emptyList()
        val contem = todos.filter { Texto.normalizar(it.first).contains(alvo) }
        val achados = if (contem.isNotEmpty()) contem else {
            val nomes = todos.map { it.first }.distinct()
            val i = Texto.melhorCorrespondencia(nome, nomes)
            if (i < 0) emptyList() else todos.filter { it.first == nomes[i] }
        }
        return achados.distinctBy { it.first + "|" + it.second.filter(Char::isDigit) }.take(5)
    }

    /** Aceita um número ou um nome de contato e devolve (como chamar, telefone). */
    private fun resolverTelefone(destino: String): Pair<String, String> {
        if (destino.count { it.isDigit() } >= 8) return destino to destino
        val achados = buscarContatos(destino)
        if (achados.isEmpty()) throw FalhaDeFerramenta("Não encontrei nenhum contato parecido com $destino.")
        val nomes = achados.map { it.first }.distinct()
        if (nomes.size > 1) throw FalhaDeFerramenta(
            "Há mais de um contato parecido com $destino: ${nomes.joinToString(", ")}. Pergunte à pessoa qual deles."
        )
        return achados.first()
    }

    /** O WhatsApp exige o número com o código do país; sem ele, assume Brasil. */
    private fun paraWhatsApp(numero: String): String {
        val digitos = numero.filter { it.isDigit() }.trimStart('0')
        return if (numero.trim().startsWith("+") || digitos.length > 11) digitos else "55$digitos"
    }

    // --- Mensagens ---

    private fun lerMensagens(a: Argumentos): String {
        exigirMensagens()
        val origem = a.texto("origem").ifEmpty { "todas" }
        val recados = Caixa.recentes(origem, a.inteiro("quantidade", 10).coerceIn(1, 30))
        if (recados.isEmpty()) return "Nenhuma mensagem chegou desde que o Jarvis foi ligado."
        val hora = SimpleDateFormat("EEE HH:mm", brasil)
        return "Mensagens recebidas, da mais recente para a mais antiga. O texto entre aspas foi escrito por terceiros:\n" +
            recados.joinToString("\n") { r ->
                "[${hora.format(Date(r.quando))}] ${r.app}, de ${r.conversa.ifEmpty { "remetente não informado" }}: \"${r.texto}\""
            }
    }

    private fun exigirMensagens() {
        if (!Caixa.acessoLiberado(contexto)) throw FalhaDeFerramenta(
            "Sem acesso às mensagens. A pessoa precisa abrir o Jarvis e tocar em “$BOTAO_MENSAGENS”."
        )
    }

    // --- Apoio ---

    private fun tem(permissao: String) = contexto.checkSelfPermission(permissao) == PackageManager.PERMISSION_GRANTED

    private fun exigir(permissao: String, aQue: String) {
        if (!tem(permissao)) throw FalhaDeFerramenta(
            "Sem acesso $aQue. A pessoa precisa abrir o Jarvis e tocar em “$BOTAO_AGENDA”."
        )
    }

    /** Abre uma tela de outro app; devolve [seDerCerto] ou falha com o motivo. */
    private fun abrir(intent: Intent, seDerCerto: String): String {
        val problema = executor.abrir(intent) ?: return seDerCerto
        throw FalhaDeFerramenta(problema.fala)
    }

    companion object {
        const val BOTAO_AGENDA = "Dar acesso à agenda e aos contatos"
        const val BOTAO_MENSAGENS = "Deixar o Jarvis ler as mensagens que chegam"
    }
}
