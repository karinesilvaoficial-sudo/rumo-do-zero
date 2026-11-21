package br.jarvis.app

import android.app.Activity
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import br.jarvis.core.FalhaDeFerramenta
import java.io.ByteArrayOutputStream
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * Dá olhos ao Jarvis: uma foto pela câmera ou uma captura da tela, sempre com a pessoa
 * participando (ela tira a foto; ela autoriza a captura). Chamado fora da thread principal.
 */
object Captura {
    const val MODO = "modo"
    const val FOTO = "foto"
    const val TELA = "tela"

    /** O pedido em andamento; a tela de captura entrega aqui a imagem ou o motivo da falha. */
    @Volatile var pendente: CompletableFuture<Bitmap>? = null

    fun foto(contexto: Context): String = pedir(contexto, FOTO, 120)
    fun tela(contexto: Context): String = pedir(contexto, TELA, 60)

    /** Abre a tela de captura, espera a imagem e a devolve em JPEG (base64), num tamanho bom para a IA ler. */
    private fun pedir(contexto: Context, modo: String, segundos: Long): String {
        val espera = CompletableFuture<Bitmap>()
        pendente = espera
        try {
            contexto.startActivity(
                Intent(contexto, CapturaActivity::class.java).putExtra(MODO, modo).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } catch (e: Exception) {
            throw FalhaDeFerramenta("O sistema não me deixou abrir a captura. Abra o Jarvis e tente de novo.")
        }
        val imagem = try {
            espera.get(segundos, TimeUnit.SECONDS)
        } catch (e: TimeoutException) {
            throw FalhaDeFerramenta("A pessoa não concluiu a captura a tempo.")
        } catch (e: Exception) {
            throw FalhaDeFerramenta((e.cause ?: e).message ?: "A captura não deu certo.")
        } finally {
            pendente = null
        }
        return paraBase64(imagem)
    }

    private fun paraBase64(original: Bitmap): String {
        val maior = maxOf(original.width, original.height)
        val imagem = if (maior <= LADO_MAXIMO) original else {
            val fator = LADO_MAXIMO.toFloat() / maior
            Bitmap.createScaledBitmap(original, (original.width * fator).toInt(), (original.height * fator).toInt(), true)
        }
        val saida = ByteArrayOutputStream()
        imagem.compress(Bitmap.CompressFormat.JPEG, 80, saida)
        return Base64.encodeToString(saida.toByteArray(), Base64.NO_WRAP)
    }

    private const val LADO_MAXIMO = 1400
}

/** Tela sem conteúdo próprio: só serve para abrir a câmera ou o pedido de captura e receber o resultado. */
class CapturaActivity : Activity() {
    private var foto: Uri? = null

    override fun onCreate(estado: Bundle?) {
        super.onCreate(estado)
        if (estado != null) {
            // O sistema recriou a tela no meio do caminho: o pedido original se perdeu.
            falhar("A captura foi interrompida.")
            return
        }
        try {
            when (intent.getStringExtra(Captura.MODO)) {
                Captura.FOTO -> {
                    // A foto vai para a galeria; o app de câmera grava direto nesse endereço.
                    val destino = contentResolver.insert(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                        ContentValues().apply {
                            put(MediaStore.Images.Media.DISPLAY_NAME, "jarvis-${System.currentTimeMillis()}.jpg")
                            put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
                        }
                    ) ?: return falhar("Não consegui preparar o arquivo da foto.")
                    foto = destino
                    startActivityForResult(
                        Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, destino)
                            .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION),
                        PEDIDO_FOTO
                    )
                }
                Captura.TELA -> startActivityForResult(
                    getSystemService(MediaProjectionManager::class.java).createScreenCaptureIntent(), PEDIDO_TELA
                )
                else -> falhar("Pedido de captura desconhecido.")
            }
        } catch (e: Exception) {
            falhar("Não encontrei um aplicativo de câmera ou a captura de tela não está disponível.")
        }
    }

    override fun onActivityResult(pedido: Int, resultado: Int, dados: Intent?) {
        super.onActivityResult(pedido, resultado, dados)
        when (pedido) {
            PEDIDO_FOTO -> {
                val destino = foto
                if (resultado != RESULT_OK || destino == null) {
                    destino?.let { runCatching { contentResolver.delete(it, null, null) } }
                    return falhar("A pessoa fechou a câmera sem tirar a foto.")
                }
                try {
                    val imagem = contentResolver.openInputStream(destino)?.use { fluxo ->
                        // Fotos de câmera são enormes; metade da resolução basta e poupa memória.
                        BitmapFactory.decodeStream(fluxo, null, BitmapFactory.Options().apply { inSampleSize = 2 })
                    } ?: return falhar("Não consegui ler a foto.")
                    Captura.pendente?.complete(imagem)
                    finish()
                } catch (e: Exception) {
                    falhar("Não consegui ler a foto.")
                }
            }
            PEDIDO_TELA -> {
                if (resultado != RESULT_OK || dados == null) return falhar("A pessoa não autorizou a captura da tela.")
                val servico = JarvisService.instancia ?: return falhar("O Jarvis precisa estar ativado para ver a tela.")
                // Tira o Jarvis da frente para a captura mostrar o que estava por baixo dele.
                moveTaskToBack(true)
                servico.capturarTela(resultado, dados) { imagem, erro ->
                    if (imagem != null) Captura.pendente?.complete(imagem)
                    else Captura.pendente?.completeExceptionally(IllegalStateException(erro ?: "A captura da tela falhou."))
                }
                finish()
            }
        }
    }

    private fun falhar(motivo: String) {
        Captura.pendente?.completeExceptionally(IllegalStateException(motivo))
        finish()
    }

    companion object {
        private const val PEDIDO_FOTO = 1
        private const val PEDIDO_TELA = 2
    }
}
