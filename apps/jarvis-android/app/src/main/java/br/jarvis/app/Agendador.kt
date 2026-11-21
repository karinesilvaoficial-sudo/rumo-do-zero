package br.jarvis.app

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import br.jarvis.core.Lembrete
import br.jarvis.core.Lembretes
import java.io.File

/** Marca no relógio do sistema a hora de cada lembrete e avisa quando ela chega. */
object Agendador {
    private const val CANAL = "jarvis-avisos"
    const val ID = "id"

    fun lembretes(contexto: Context) = Lembretes(File(contexto.applicationContext.filesDir, "lembretes.txt"))

    fun agendar(contexto: Context, lembrete: Lembrete) {
        val alarmes = contexto.getSystemService(AlarmManager::class.java)
        val aviso = intencao(contexto, lembrete.id)
        // Sem a permissão de alarme exato, o sistema pode atrasar o aviso alguns minutos para poupar bateria.
        val exato = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmes.canScheduleExactAlarms()
        try {
            if (exato) alarmes.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, lembrete.quando, aviso)
            else alarmes.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, lembrete.quando, aviso)
        } catch (e: SecurityException) {
            alarmes.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, lembrete.quando, aviso)
        }
    }

    fun cancelar(contexto: Context, id: Int) {
        contexto.getSystemService(AlarmManager::class.java).cancel(intencao(contexto, id))
    }

    /** Depois de um reinício do celular, os alarmes somem: marca de novo os que ainda não venceram. */
    fun reagendarTodos(contexto: Context) {
        for (lembrete in lembretes(contexto).listar()) agendar(contexto, lembrete)
    }

    /** Mostra o aviso na barra e, se o Jarvis estiver ativo, ele fala. */
    fun avisar(contexto: Context, texto: String, idDaNotificacao: Int) {
        val gerente = contexto.getSystemService(NotificationManager::class.java)
        gerente.createNotificationChannel(NotificationChannel(CANAL, "Avisos do Jarvis", NotificationManager.IMPORTANCE_HIGH))
        val abrir = PendingIntent.getActivity(
            contexto, 0, Intent(contexto, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        try {
            gerente.notify(
                idDaNotificacao,
                Notification.Builder(contexto, CANAL)
                    .setSmallIcon(R.drawable.ic_notificacao)
                    .setContentTitle("Jarvis")
                    .setContentText(texto)
                    .setStyle(Notification.BigTextStyle().bigText(texto))
                    .setContentIntent(abrir)
                    .setAutoCancel(true)
                    .build()
            )
        } catch (e: SecurityException) {
            // Sem permissão de notificações: o aviso falado ainda acontece.
        }
        JarvisService.anunciar(contexto, texto)
    }

    private fun intencao(contexto: Context, id: Int): PendingIntent = PendingIntent.getBroadcast(
        contexto, id, Intent(contexto, LembreteReceiver::class.java).putExtra(ID, id),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
}

/** Chegou a hora de um lembrete. */
class LembreteReceiver : BroadcastReceiver() {
    override fun onReceive(contexto: Context, intent: Intent) {
        val lembrete = Agendador.lembretes(contexto).remover(intent.getIntExtra(Agendador.ID, -1)) ?: return
        Agendador.avisar(contexto, "Mestre, lembrete: ${lembrete.texto}.", 1000 + lembrete.id)
    }
}

/** O celular acabou de ligar: refaz os lembretes e volta a escutar, se o Jarvis estava ativo. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(contexto: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        Agendador.reagendarTodos(contexto)
        if (!Preferencias(contexto).ativo) return
        // O Android só deixa ligar o microfone a partir de uma tela aberta; por isso o Jarvis
        // abre a própria tela por um instante. Sem a permissão de aparecer, pede um toque.
        if (Settings.canDrawOverlays(contexto)) {
            try {
                contexto.startActivity(
                    Intent(contexto, MainActivity::class.java).putExtra(MainActivity.ATIVAR, true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
                return
            } catch (e: Exception) {
                // Cai no aviso abaixo.
            }
        }
        Agendador.avisar(contexto, "O celular reiniciou. Toque aqui para o Jarvis voltar a escutar.", 999)
    }
}
