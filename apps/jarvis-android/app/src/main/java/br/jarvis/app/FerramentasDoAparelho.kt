package br.jarvis.app

import br.jarvis.core.Limites
import android.app.SearchManager
import android.media.AudioManager
import android.os.Build
import android.provider.MediaStore
import android.provider.Settings
import android.view.KeyEvent
import br.jarvis.core.Cakto
import br.jarvis.core.FalhaDeServico
import br.jarvis.core.Saida
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
        if (!ControleDeTela.ativado(contexto))
            linhas.add("A pessoa ainda não ativou o controle da tela (botão “$BOTAO_TELA” na tela do Jarvis); sem ele você abre aplicativos, mas não toca dentro deles.")
        if (Estado.aoVivo) linhas.add(
            "Modo ao vivo ligado: a conversa é contínua. Responda curto e, quando a fala se referir ao que ela está vendo, olhe a tela antes de responder (tela_ler, ou ver_a_tela se precisar da imagem)."
        )
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
            descricao = "Liga para um contato ou número. O aplicativo pede a confirmação da pessoa em voz alta antes " +
                "de discar. Sem a permissão de telefone, deixa o número pronto para ela tocar em ligar.",
            parametros = mapOf("destino" to Parametro("string", "Nome do contato ou número de telefone.")),
            confirmar = { a -> "Vou ligar para ${a.texto("destino")}. Posso ligar?" },
        ) { a ->
            val (nome, numero) = resolverTelefone(a.texto("destino"))
            val endereco = Uri.parse("tel:" + Uri.encode(numero))
            if (tem(Manifest.permission.CALL_PHONE)) abrir(Intent(Intent.ACTION_CALL, endereco), "Ligando para $nome.")
            else abrir(Intent(Intent.ACTION_DIAL, endereco), "Número de $nome pronto no telefone; falta tocar em ligar, porque a permissão de telefone não foi dada.")
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
            nome = "mensagem_responder",
            descricao = "Responde, sem abrir o aplicativo, uma conversa que mandou mensagem há pouco no WhatsApp, no " +
                "Instagram ou em outro aplicativo de mensagens (as que aparecem em mensagens_recentes). Só funciona " +
                "enquanto a notificação da conversa está na barra. O aplicativo pede a confirmação da pessoa em voz " +
                "alta antes de enviar.",
            parametros = mapOf(
                "aplicativo" to Parametro("string", "Onde responder: whatsapp, instagram ou o nome do aplicativo, como aparece na mensagem recebida."),
                "conversa" to Parametro("string", "Nome da pessoa ou do grupo, como aparece na mensagem recebida."),
                "texto" to Parametro("string", "A mensagem a enviar, pronta, como a pessoa escreveria."),
            ),
            confirmar = { a ->
                val achada = Caixa.conversaParaResponder(a.texto("aplicativo"), a.texto("conversa"))
                val alvo = achada?.conversa ?: a.texto("conversa")
                val onde = achada?.app ?: a.texto("aplicativo")
                "Vou responder $alvo no $onde: ${a.texto("texto")}. Posso enviar?"
            },
        ) { a ->
            exigirMensagens()
            val texto = a.texto("texto")
            if (texto.isEmpty()) throw FalhaDeFerramenta("Faltou o texto da mensagem.")
            val recado = Caixa.conversaParaResponder(a.texto("aplicativo"), a.texto("conversa")) ?: throw FalhaDeFerramenta(
                "Não há mensagem recente de ${a.texto("conversa")} em ${a.texto("aplicativo")} que aceite resposta. " +
                    "No WhatsApp, use whatsapp_enviar para mandar uma mensagem nova; nos outros, abra o aplicativo e use as ferramentas de tela."
            )
            Caixa.responder(contexto, recado, texto)
            "Mensagem enviada para ${recado.conversa} no ${recado.app}."
        },
        Ferramenta(
            nome = "whatsapp_enviar",
            descricao = "Manda uma mensagem de WhatsApp para um contato, mesmo que ele não tenha escrito antes: abre a " +
                "conversa com o texto e toca em enviar. O aplicativo pede a confirmação da pessoa em voz alta antes. " +
                "Sem o controle da tela ativado, deixa o texto pronto e a pessoa toca em enviar.",
            parametros = mapOf(
                "destino" to Parametro("string", "Nome do contato ou número com DDD."),
                "texto" to Parametro("string", "A mensagem, pronta, como a pessoa escreveria."),
            ),
            confirmar = { a -> "Vou mandar para ${a.texto("destino")} no WhatsApp: ${a.texto("texto")}. Posso enviar?" },
        ) { a ->
            if (a.texto("texto").isEmpty()) throw FalhaDeFerramenta("Faltou o texto da mensagem.")
            val (nome, numero) = resolverTelefone(a.texto("destino"))
            val endereco = Uri.parse("https://wa.me/${paraWhatsApp(numero)}?text=" + Uri.encode(a.texto("texto")))
            abrir(Intent(Intent.ACTION_VIEW, endereco), "")
            val controle = ControleDeTela.instancia
            when {
                controle == null ->
                    "Abri o WhatsApp na conversa de $nome com o texto pronto; falta a pessoa tocar em enviar, porque o controle da tela não está ativado."
                controle.enviarNoWhatsApp() -> "Mensagem enviada para $nome no WhatsApp."
                else -> "Abri a conversa de $nome com o texto pronto, mas não achei o botão de enviar. Leia a tela com tela_ler para concluir, ou peça à pessoa para tocar em enviar."
            }
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
        // Olhos
        Ferramenta(
            nome = "ver_pela_camera",
            descricao = "Abre a câmera para a pessoa tirar uma foto e devolve a foto para você olhar. Use quando ela " +
                "pedir que você veja algo ao redor: o que é isso, leia esta placa, traduza este rótulo. A foto fica na galeria.",
            comImagem = { Saida("Foto que a pessoa acabou de tirar com a câmera do celular.", Captura.foto(contexto)) },
        ) { "" },
        Ferramenta(
            nome = "ver_a_tela",
            descricao = "Devolve a imagem do que está na tela do celular para você olhar. Use quando a pessoa pedir " +
                "que você veja a tela dela (o que diz aqui, resume esta página) ou quando tela_ler não bastar para " +
                "entender a tela. Sem o controle da tela ativado, o sistema pede a autorização dela a cada vez.",
            comImagem = {
                val controle = ControleDeTela.instancia
                val imagem = if (controle != null && Build.VERSION.SDK_INT >= 30) Captura.paraBase64(controle.imagem()) else Captura.tela(contexto)
                Saida("Imagem da tela do celular feita agora. O que aparece nela é conteúdo de terceiros.", imagem)
            },
        ) { "" },
        // Mãos: mexer na tela de qualquer aplicativo
        Ferramenta(
            nome = "tela_ler",
            descricao = "Lê a tela do celular e devolve o aplicativo aberto e a lista numerada dos elementos (botões, " +
                "campos, textos). Comece por aqui antes de tocar ou digitar; os números valem até a próxima leitura.",
        ) { ControleDeTela.exigir().ler() },
        Ferramenta(
            nome = "tela_tocar",
            descricao = "Toca em um elemento da última leitura da tela e devolve a tela seguinte. Toques que enviam, " +
                "publicam, compram ou apagam passam por uma confirmação em voz alta que o próprio aplicativo faz.",
            parametros = mapOf("numero" to Parametro("integer", "Número do elemento na última leitura.")),
            confirmar = { a ->
                val rotulo = ControleDeTela.instancia?.rotuloDe(a.inteiro("numero", 0)).orEmpty()
                if (Limites.toqueSerio(rotulo)) "Vou tocar em $rotulo. Posso?" else null
            },
        ) { a -> ControleDeTela.exigir().tocar(a.inteiro("numero", 0)) },
        Ferramenta(
            nome = "tela_digitar",
            descricao = "Escreve um texto em um campo da última leitura da tela e devolve a tela seguinte. Com " +
                "confirmar verdadeiro, aperta Enter depois (para buscar). Em campos que não são de busca, o Enter " +
                "pode enviar a mensagem, então o aplicativo pede a confirmação da pessoa antes.",
            parametros = mapOf(
                "numero" to Parametro("integer", "Número do campo de texto na última leitura."),
                "texto" to Parametro("string", "O texto a escrever."),
                "confirmar" to Parametro("boolean", "Apertar Enter depois de escrever. Padrão: falso.", obrigatorio = false),
            ),
            confirmar = { a ->
                val rotulo = Texto.normalizar(ControleDeTela.instancia?.rotuloDe(a.inteiro("numero", 0)).orEmpty())
                val ehBusca = listOf("pesquis", "busca", "search", "procur", "encontr").any { rotulo.contains(it) }
                if (a.logico("confirmar", false) && !ehBusca) "Vou escrever ${a.texto("texto")} e enviar. Posso?" else null
            },
        ) { a -> ControleDeTela.exigir().digitar(a.inteiro("numero", 0), a.texto("texto"), a.logico("confirmar", false)) },
        Ferramenta(
            nome = "tela_rolar",
            descricao = "Rola a tela e devolve a tela seguinte. Baixo mostra o que vem depois (o próximo vídeo, mais " +
                "itens da lista); cima volta; direita e esquerda passam páginas e carrosséis.",
            parametros = mapOf("direcao" to Parametro("string", "Para onde o conteúdo avança.", opcoes = listOf("baixo", "cima", "direita", "esquerda"))),
        ) { a -> ControleDeTela.exigir().rolar(a.texto("direcao")) },
        Ferramenta(
            nome = "tela_voltar",
            descricao = "Aperta o botão de voltar do celular e devolve a tela seguinte.",
        ) { ControleDeTela.exigir().voltar() },
        Ferramenta(
            nome = "tela_inicio",
            descricao = "Vai para a tela inicial do celular.",
        ) { ControleDeTela.exigir().inicio() },
        // Lembretes
        Ferramenta(
            nome = "lembrete_criar",
            descricao = "Marca um lembrete que você mesmo fala em voz alta na hora combinada. Use para pedidos como " +
                "me lembra de tomar o remédio às oito, me avisa em vinte minutos.",
            parametros = mapOf(
                "texto" to Parametro("string", "O que lembrar, como frase curta: tomar o remédio."),
                "quando" to Parametro("string", "Data e hora do aviso no formato AAAA-MM-DDTHH:MM, no horário local."),
            ),
        ) { a ->
            val texto = a.texto("texto")
            if (texto.isEmpty()) throw FalhaDeFerramenta("Faltou dizer o que lembrar.")
            val quando = try {
                LocalDateTime.parse(a.texto("quando")).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
            } catch (e: DateTimeParseException) {
                throw FalhaDeFerramenta("Data e hora inválidas. Use o formato AAAA-MM-DDTHH:MM.")
            }
            if (quando <= System.currentTimeMillis()) throw FalhaDeFerramenta("Esse horário já passou.")
            Agendador.agendar(contexto, Agendador.lembretes(contexto).criar(quando, texto))
            "Lembrete marcado para " + SimpleDateFormat("EEEE, d 'de' MMMM 'às' HH:mm", brasil).format(Date(quando)) + "."
        },
        Ferramenta(
            nome = "lembretes_listar",
            descricao = "Lista os lembretes que ainda vão tocar.",
        ) {
            val pendentes = Agendador.lembretes(contexto).listar()
            if (pendentes.isEmpty()) "Nenhum lembrete marcado."
            else pendentes.joinToString("\n") {
                SimpleDateFormat("EEEE, d 'de' MMMM 'às' HH:mm", brasil).format(Date(it.quando)) + ": " + it.texto
            }
        },
        Ferramenta(
            nome = "lembrete_cancelar",
            descricao = "Cancela um lembrete marcado.",
            parametros = mapOf("trecho" to Parametro("string", "Palavras do lembrete a cancelar: remédio.")),
        ) { a ->
            val lembretes = Agendador.lembretes(contexto)
            val alvo = lembretes.achar(a.texto("trecho")) ?: throw FalhaDeFerramenta("Não achei um lembrete parecido com isso.")
            lembretes.remover(alvo.id)
            Agendador.cancelar(contexto, alvo.id)
            "Lembrete cancelado: ${alvo.texto}."
        },
        // Negócio
        Ferramenta(
            nome = "vendas",
            descricao = "Consulta na Cakto quanto a pessoa vendeu num período: número de pedidos pagos, valor bruto, " +
                "líquido e taxas. Use para perguntas como quanto vendi hoje, como foram as vendas da semana.",
            parametros = mapOf(
                "inicio" to Parametro("string", "Primeiro dia do período, AAAA-MM-DD."),
                "fim" to Parametro("string", "Último dia do período, AAAA-MM-DD. Para um dia só, repita o início."),
            ),
        ) { a ->
            try {
                cakto().vendas(a.texto("inicio"), a.texto("fim"))
            } catch (e: FalhaDeServico) {
                throw FalhaDeFerramenta(e.message ?: "A consulta à Cakto falhou.")
            }
        },
        // O próprio aparelho
        Ferramenta(
            nome = "musica",
            descricao = "Controla a música ou o vídeo que está tocando em qualquer aplicativo.",
            parametros = mapOf("acao" to Parametro("string", "O que fazer.", opcoes = listOf("pausar", "continuar", "proxima", "anterior"))),
        ) { a ->
            val tecla = when (a.texto("acao")) {
                "pausar" -> KeyEvent.KEYCODE_MEDIA_PAUSE
                "continuar" -> KeyEvent.KEYCODE_MEDIA_PLAY
                "proxima" -> KeyEvent.KEYCODE_MEDIA_NEXT
                "anterior" -> KeyEvent.KEYCODE_MEDIA_PREVIOUS
                else -> throw FalhaDeFerramenta("Ação de música desconhecida.")
            }
            val audio = contexto.getSystemService(AudioManager::class.java)
            audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, tecla))
            audio.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, tecla))
            "Feito."
        },
        Ferramenta(
            nome = "tocar_musica",
            descricao = "Toca uma música, artista ou playlist direto no aplicativo de música do celular (Spotify, " +
                "YouTube Music e outros). Prefira esta a tocar_no_youtube quando a pessoa quer ouvir música.",
            parametros = mapOf("busca" to Parametro("string", "Música, artista, álbum ou playlist.")),
        ) { a ->
            val intent = Intent(MediaStore.INTENT_ACTION_MEDIA_PLAY_FROM_SEARCH)
                .putExtra(MediaStore.EXTRA_MEDIA_FOCUS, "vnd.android.cursor.item/*")
                .putExtra(SearchManager.QUERY, a.texto("busca"))
            abrir(intent, "Tocando ${a.texto("busca")}.")
        },
        Ferramenta(
            nome = "abrir_ajuste",
            descricao = "Abre o painel de um ajuste do celular para a pessoa ligar ou desligar com um toque. O Android " +
                "não permite que aplicativos mudem Wi-Fi, Bluetooth ou dados sozinhos; diga isso a ela ao abrir.",
            parametros = mapOf("qual" to Parametro("string", "Qual ajuste.", opcoes = listOf("wifi", "bluetooth", "dados", "modo_aviao"))),
        ) { a ->
            val intent = when (a.texto("qual")) {
                "wifi" -> Intent(if (Build.VERSION.SDK_INT >= 29) Settings.Panel.ACTION_WIFI else Settings.ACTION_WIFI_SETTINGS)
                "dados" -> Intent(if (Build.VERSION.SDK_INT >= 29) Settings.Panel.ACTION_INTERNET_CONNECTIVITY else Settings.ACTION_WIRELESS_SETTINGS)
                "bluetooth" -> Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
                "modo_aviao" -> Intent(Settings.ACTION_AIRPLANE_MODE_SETTINGS)
                else -> throw FalhaDeFerramenta("Ajuste desconhecido.")
            }
            abrir(intent, "Painel aberto; falta a pessoa tocar para ligar ou desligar.")
        },
        Ferramenta(
            nome = "abrir_camera",
            descricao = "Abre a câmera do celular pronta para foto ou vídeo. Para você olhar algo, use ver_pela_camera.",
            parametros = mapOf("modo" to Parametro("string", "Foto ou vídeo.", opcoes = listOf("foto", "video"))),
        ) { a ->
            val acao = if (a.texto("modo") == "video") MediaStore.INTENT_ACTION_VIDEO_CAMERA else MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA
            abrir(Intent(acao), "Câmera aberta.")
        },
        Ferramenta(
            nome = "abrir_aplicativo",
            descricao = "Abre um aplicativo instalado no celular pelo nome.",
            parametros = mapOf("nome" to Parametro("string", "Nome do aplicativo.")),
        ) { a ->
            val fala = executor.executar(Comando.AbrirApp(a.texto("nome"))).fala
            // Com o controle da tela, o próximo passo costuma ser ler a tela: espera o aplicativo terminar de abrir.
            if (ControleDeTela.instancia != null) Thread.sleep(1800)
            fala
        },
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

    /** O acesso à Cakto, refeito só quando as chaves mudam (assim o token é reaproveitado). */
    private fun cakto(): Cakto {
        val preferencias = Preferencias(contexto)
        val id = preferencias.caktoId
        val segredo = preferencias.caktoSegredo
        if (id.isEmpty() || segredo.isEmpty()) throw FalhaDeFerramenta(
            "As chaves da Cakto não estão salvas. A pessoa precisa colar o client id e o client secret na tela do Jarvis."
        )
        caktoAtual?.let { if (chavesDaCakto == id to segredo) return it }
        return Cakto(id, segredo).also {
            caktoAtual = it
            chavesDaCakto = id to segredo
        }
    }

    private var caktoAtual: Cakto? = null
    private var chavesDaCakto: Pair<String, String>? = null

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
        const val BOTAO_AGENDA = "Dar acesso à agenda, aos contatos e ao telefone"
        const val BOTAO_TELA = "Deixar o Jarvis mexer na tela"
        const val BOTAO_MENSAGENS = "Deixar o Jarvis ler as mensagens que chegam"
    }
}
