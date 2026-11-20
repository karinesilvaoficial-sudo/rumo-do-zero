package br.jarvis.app

import android.app.Notification
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import br.jarvis.core.FalhaDeFerramenta
import br.jarvis.core.Texto

/** Uma mensagem que chegou em algum app, lida da notificação. */
class Recado(
    val pacote: String,
    val app: String,
    /** Quem mandou, ou o nome do grupo. */
    val conversa: String,
    val texto: String,
    val quando: Long,
    val ehEmail: Boolean,
    /** A ação "Responder" da notificação, quando o app oferece. */
    val resposta: Notification.Action?,
) {
    val ehWhatsApp: Boolean get() = pacote in Caixa.PACOTES_DO_WHATSAPP
}

/**
 * Recebe do Android as notificações dos outros apps. É assim que o Jarvis lê as mensagens
 * do WhatsApp e os e-mails que chegam, sem precisar da senha de nenhuma conta. Só funciona
 * depois que a pessoa libera o acesso nas configurações do aparelho.
 */
class OuvinteDeNotificacoes : NotificationListenerService() {
    override fun onListenerConnected() {
        try {
            activeNotifications?.forEach { Caixa.receber(this, it) }
        } catch (e: Exception) {
            // Alguns aparelhos negam a lista inicial; as próximas notificações chegam do mesmo jeito.
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn != null) Caixa.receber(this, sbn)
    }
}

/** As mensagens recentes, guardadas só na memória do aparelho enquanto o Jarvis está aberto. */
object Caixa {
    val PACOTES_DO_WHATSAPP = setOf("com.whatsapp", "com.whatsapp.w4b")
    private val PACOTES_DE_EMAIL = setOf(
        "com.google.android.gm", "com.microsoft.office.outlook", "com.yahoo.mobile.client.android.mail",
        "com.samsung.android.email.provider", "ch.protonmail.android", "com.fsck.k9", "me.bluemail.mail",
    )
    private const val MAXIMO = 80

    private val recados = ArrayList<Recado>()

    fun acessoLiberado(contexto: Context): Boolean {
        val ligados = Settings.Secure.getString(contexto.contentResolver, "enabled_notification_listeners") ?: return false
        val nosso = ComponentName(contexto, OuvinteDeNotificacoes::class.java)
        return ligados.split(":").any { ComponentName.unflattenFromString(it) == nosso }
    }

    fun receber(contexto: Context, sbn: StatusBarNotification) {
        if (sbn.packageName == contexto.packageName) return
        val n = sbn.notification ?: return
        // Resumos de grupo repetem o que já veio; notificações fixas são música, chamadas e downloads.
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        if (n.flags and Notification.FLAG_ONGOING_EVENT != 0) return
        val extras = n.extras ?: return
        val conversa = (extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)
            ?: extras.getCharSequence(Notification.EXTRA_TITLE))?.toString()?.trim().orEmpty()
        val texto = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
            ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()?.trim().orEmpty()
        if (texto.isEmpty()) return

        val responder = n.actions?.firstOrNull { acao ->
            acao.remoteInputs?.any { it.allowFreeFormInput } == true
        }
        val recado = Recado(
            pacote = sbn.packageName,
            app = nomeDoApp(contexto, sbn.packageName),
            conversa = conversa,
            texto = texto.take(1000),
            quando = sbn.postTime,
            ehEmail = sbn.packageName in PACOTES_DE_EMAIL || n.category == Notification.CATEGORY_EMAIL,
            resposta = responder,
        )
        synchronized(recados) {
            // O mesmo aviso costuma ser reenviado a cada mensagem nova da conversa: fica só o mais recente.
            recados.removeAll { it.pacote == recado.pacote && it.conversa == recado.conversa && it.texto == recado.texto }
            recados.add(recado)
            while (recados.size > MAXIMO) recados.removeAt(0)
        }
    }

    /** As mais recentes primeiro. [origem]: "whatsapp", "email" ou "todas". */
    fun recentes(origem: String, quantidade: Int): List<Recado> = synchronized(recados) {
        recados.filter {
            when (origem) {
                "whatsapp" -> it.ehWhatsApp
                "email" -> it.ehEmail
                else -> true
            }
        }.sortedByDescending { it.quando }.take(quantidade)
    }

    /** A notificação mais recente da conversa do WhatsApp cujo nome mais parece com [nome] e que aceita resposta. */
    fun conversaDoWhatsApp(nome: String): Recado? {
        val candidatos = synchronized(recados) {
            recados.filter { it.ehWhatsApp && it.resposta != null }.sortedByDescending { it.quando }
        }
        val nomes = candidatos.map { it.conversa }.distinct()
        val i = Texto.melhorCorrespondencia(nome, nomes)
        return if (i < 0) null else candidatos.first { it.conversa == nomes[i] }
    }

    /** Envia [texto] pela ação "Responder" da notificação, sem abrir o app. */
    fun responder(contexto: Context, recado: Recado, texto: String) {
        val acao = recado.resposta ?: throw FalhaDeFerramenta("Essa conversa não aceita resposta pela notificação.")
        val entradas = acao.remoteInputs ?: throw FalhaDeFerramenta("Essa conversa não aceita resposta pela notificação.")
        val dados = Bundle()
        for (entrada in entradas) dados.putCharSequence(entrada.resultKey, texto)
        val intent = Intent().addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        RemoteInput.addResultsToIntent(entradas, intent, dados)
        try {
            acao.actionIntent.send(contexto, 0, intent)
        } catch (e: PendingIntent.CanceledException) {
            throw FalhaDeFerramenta(
                "A notificação dessa conversa já foi dispensada, então não dá mais para responder por ela. " +
                    "Ofereça abrir a conversa no WhatsApp com o texto pronto."
            )
        }
    }

    private fun nomeDoApp(contexto: Context, pacote: String): String = try {
        val pm = contexto.packageManager
        pm.getApplicationLabel(pm.getApplicationInfo(pacote, 0)).toString()
    } catch (e: Exception) {
        pacote
    }
}
