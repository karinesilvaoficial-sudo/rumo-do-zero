package br.jarvis.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class InterpretadorTest {
    private fun i(frase: String) = Interpretador.interpretar(frase)

    @Test fun abrirApps() {
        assertEquals(Comando.AbrirApp("youtube"), i("Abrir YouTube"))
        assertEquals(Comando.AbrirApp("whatsapp"), i("abre o WhatsApp por favor"))
        assertEquals(Comando.AbrirApp("camera"), i("Jarvis, abrir a câmera"))
        assertEquals(Comando.AbrirApp("google maps"), i("iniciar aplicativo Google Maps"))
    }

    @Test fun abrirSemNomeAbreOJarvis() {
        assertEquals(Comando.AbrirJarvis, i("abrir"))
        assertEquals(Comando.AbrirJarvis, i("Jarvis abrir"))
    }

    @Test fun perguntas() {
        assertEquals(Comando.Horas, i("Que horas são?"))
        assertEquals(Comando.Data, i("que dia é hoje"))
        assertEquals(Comando.Bateria, i("como está a bateria"))
    }

    @Test fun pesquisaEYoutube() {
        assertEquals(Comando.Pesquisar("receita de bolo"), i("pesquisar receita de bolo"))
        assertEquals(Comando.Pesquisar("clima em sao paulo"), i("procure por clima em São Paulo"))
        assertEquals(Comando.TocarNoYoutube("legiao urbana"), i("tocar Legião Urbana no YouTube"))
        assertEquals(Comando.TocarNoYoutube("lofi"), i("toca lofi"))
    }

    @Test fun lanternaEVolume() {
        assertEquals(Comando.Lanterna(true), i("ligar a lanterna"))
        assertEquals(Comando.Lanterna(false), i("desliga a lanterna"))
        assertEquals(Comando.Volume(AcaoVolume.AUMENTAR), i("aumentar o volume"))
        assertEquals(Comando.Volume(AcaoVolume.DIMINUIR), i("abaixa o som"))
        assertEquals(Comando.Volume(AcaoVolume.MUDO), i("silenciar"))
        assertEquals(Comando.Volume(AcaoVolume.MAXIMO), i("volume no máximo"))
    }

    @Test fun temporizadorEAlarme() {
        assertEquals(Comando.Temporizador(300), i("timer de 5 minutos"))
        assertEquals(Comando.Temporizador(1500), i("temporizador de vinte e cinco minutos"))
        assertEquals(Comando.Temporizador(3630), i("timer de 1 hora e 30 segundos"))
        assertEquals(Comando.Alarme(7, 0), i("alarme para 7 horas"))
        assertEquals(Comando.Alarme(7, 30), i("criar alarme para as 7:30"))
        assertEquals(Comando.Alarme(6, 15), i("me acorde às seis e quinze"))
        assertEquals(Comando.Alarme(20, 0), i("alarme para 8 da noite"))
    }

    @Test fun ligarParaAlguemNaoEhLanterna() {
        assertEquals(Comando.Ligar("maria"), i("ligar para Maria"))
    }

    @Test fun mensagens() {
        assertEquals(Comando.Mensagem("maria", "chego às oito"), i("mandar mensagem para Maria dizendo que chego às oito"))
        assertEquals(Comando.Mensagem("joao", "oi tudo bem"), i("manda um whatsapp pro João falando oi tudo bem"))
        assertEquals(Comando.Mensagem("minha mae", "te amo"), i("enviar mensagem para minha mãe no whatsapp dizendo te amo"))
        assertEquals(Comando.Mensagem("pedro", "já estou saindo"), i("Jarvis, manda mensagem pro Pedro já estou saindo"))
        assertEquals(Comando.Mensagem("ana", ""), i("mandar mensagem para a Ana"))
        // "mandar" sem mensagem não é mensagem
        assertTrue(i("mandar ver") is Comando.Desconhecido)
    }

    @Test fun conversa() {
        assertEquals(Comando.Saudacao, i("Bom dia"))
        assertEquals(Comando.Agradecimento, i("obrigado"))
        assertEquals(Comando.Desligar, i("desligar"))
        assertEquals(Comando.Cancelar, i("cancelar"))
        assertEquals(Comando.Vazio, i("  "))
        assertEquals(Comando.Vazio, i("Jarvis"))
        assertTrue(i("xpto blablabla") is Comando.Desconhecido)
    }

    @Test fun palavraChave() {
        assertEquals(PalavraChave.Resultado(true, "que horas sao"), PalavraChave.procurar("Jarvis, que horas são?"))
        assertEquals(PalavraChave.Resultado(true, ""), PalavraChave.procurar("ei jarvis"))
        assertFalse(PalavraChave.procurar("já vi isso antes").ativou)
        assertEquals(Comando.AbrirApp("youtube"), i("Javis abrir YouTube"))
        assertFalse(PalavraChave.procurar("vou viajar para Paris com o Travis").ativou)
    }

    @Test fun correspondenciaDeApps() {
        val apps = listOf("YouTube", "YouTube Music", "WhatsApp", "Câmera", "Calculadora", "Google Maps", "Configurações")
        fun achar(nome: String) = Texto.melhorCorrespondencia(nome, apps).let { if (it < 0) null else apps[it] }
        assertEquals("YouTube", achar("youtube"))
        assertEquals("YouTube", achar("you tube"))
        assertEquals("WhatsApp", achar("whats app"))
        assertEquals("WhatsApp", achar("uatsapp"))
        assertEquals("Câmera", achar("camera"))
        assertEquals("Google Maps", achar("maps"))
        assertEquals("Configurações", achar("configuracoes"))
        assertEquals("Calculadora", achar("calculadora"))
        assertEquals(null, achar("banco imobiliario"))
    }
}
