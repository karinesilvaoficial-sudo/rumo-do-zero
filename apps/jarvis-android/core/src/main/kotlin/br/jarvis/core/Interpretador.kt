package br.jarvis.core

/** Transforma a frase falada (em português) em um [Comando]. */
object Interpretador {
    private val verbosAbrir = listOf("abrir", "abre", "abra", "abri", "iniciar", "inicia", "inicie", "executar", "executa", "acessar", "acessa")
    private val verbosPesquisar = listOf("pesquisar", "pesquisa", "pesquise", "buscar", "busca", "busque", "procurar", "procura", "procure")
    private val verbosTocar = listOf("tocar", "toca", "toque", "reproduzir", "reproduz")
    private val enfeites = setOf("o", "a", "os", "as", "um", "uma", "app", "aplicativo", "programa", "por", "pra", "para", "favor", "meu", "minha")
    private val cortesias = listOf("por favor", "por gentileza", "pra mim", "para mim", "ai", "agora")

    private val numerosPorExtenso = mapOf(
        "zero" to 0, "um" to 1, "uma" to 1, "dois" to 2, "duas" to 2, "tres" to 3, "quatro" to 4,
        "cinco" to 5, "seis" to 6, "sete" to 7, "oito" to 8, "nove" to 9, "dez" to 10, "onze" to 11,
        "doze" to 12, "treze" to 13, "quatorze" to 14, "catorze" to 14, "quinze" to 15,
        "dezesseis" to 16, "dezessete" to 17, "dezoito" to 18, "dezenove" to 19, "vinte" to 20,
        "trinta" to 30, "quarenta" to 40, "cinquenta" to 50, "sessenta" to 60, "meia" to 30,
    )

    fun interpretar(frase: String): Comando {
        var t = Texto.normalizar(frase)
        // Se a pessoa repetiu o nome ("jarvis, abrir..."), ignora o nome.
        PalavraChave.procurar(t).let { if (it.ativou) t = it.resto }
        for (c in cortesias) t = t.removeSuffix(" $c").removePrefix("$c ")
        t = t.trim()
        if (t.isEmpty()) return Comando.Vazio
        val palavras = t.split(" ")
        val primeira = palavras.first()
        val resto = palavras.drop(1)

        if (t in setOf("cancelar", "cancela", "nada", "deixa", "deixa pra la", "esquece")) return Comando.Cancelar
        if (t in setOf("desligar", "desliga", "desativar", "dormir", "pode dormir", "parar de ouvir", "parar de escutar", "encerrar"))
            return Comando.Desligar

        lanterna(t)?.let { return it }
        volume(t)?.let { return it }
        temporizador(palavras)?.let { return it }
        alarme(palavras)?.let { return it }

        if (primeira in verbosAbrir) {
            val nome = resto.dropWhile { it in enfeites }.joinToString(" ")
            return if (nome.isEmpty() || nome == "jarvis") Comando.AbrirJarvis else Comando.AbrirApp(nome)
        }
        if (primeira in verbosTocar) {
            val termo = resto.joinToString(" ").removeSuffix(" no youtube").removeSuffix(" no you tube").trim()
            if (termo.isNotEmpty()) return Comando.TocarNoYoutube(termo)
        }
        if (primeira in verbosPesquisar) {
            val termo = resto.dropWhile { it in setOf("por", "sobre", "na", "no", "internet", "google") }.joinToString(" ")
            if (termo.endsWith(" no youtube")) return Comando.TocarNoYoutube(termo.removeSuffix(" no youtube"))
            if (termo.isNotEmpty()) return Comando.Pesquisar(termo)
        }
        if (primeira in setOf("ligar", "liga", "ligue", "telefonar", "chamar") && resto.isNotEmpty()) {
            val destino = resto.dropWhile { it in enfeites }.joinToString(" ")
            if (destino.isNotEmpty()) return Comando.Ligar(destino)
        }

        if ("horas" in palavras || t.contains("que hora") || t == "hora") return Comando.Horas
        if (t.contains("que dia") || t.contains("data de hoje") || t.contains("dia e hoje") || t == "data") return Comando.Data
        if ("bateria" in palavras || "carga" in palavras) return Comando.Bateria
        if (primeira in setOf("ola", "oi", "opa", "eai") || t.startsWith("bom dia") || t.startsWith("boa tarde") || t.startsWith("boa noite") || t.startsWith("tudo bem"))
            return Comando.Saudacao
        if (primeira in setOf("obrigado", "obrigada", "valeu")) return Comando.Agradecimento
        if (t.contains("o que voce") || t.contains("ajuda") || t.contains("comandos")) return Comando.Ajuda

        return Comando.Desconhecido(frase.trim())
    }

    private fun lanterna(t: String): Comando? {
        if (!t.contains("lanterna") && !t.contains("flash")) return null
        val desligar = listOf("desliga", "apaga", "desativa").any { t.contains(it) }
        return Comando.Lanterna(!desligar)
    }

    private fun volume(t: String): Comando? {
        val falaDeVolume = t.contains("volume") || t.contains("som")
        return when {
            t == "mudo" || t == "silencio" || t.contains("silenciar") || (falaDeVolume && (t.contains("mudo") || t.contains("tirar") || t.contains("tira"))) ->
                Comando.Volume(AcaoVolume.MUDO)
            falaDeVolume && t.contains("maximo") -> Comando.Volume(AcaoVolume.MAXIMO)
            (falaDeVolume && listOf("aument", "sub", "mais alto", "levant").any { t.contains(it) }) || t == "mais alto" ->
                Comando.Volume(AcaoVolume.AUMENTAR)
            (falaDeVolume && listOf("diminu", "abaix", "baix", "reduz", "mais baixo").any { t.contains(it) }) || t == "mais baixo" ->
                Comando.Volume(AcaoVolume.DIMINUIR)
            else -> null
        }
    }

    private fun numero(palavra: String): Int? = palavra.toIntOrNull() ?: numerosPorExtenso[palavra]

    /** Lê um número de até duas palavras a partir de [i] ("vinte e cinco", "10"). Devolve valor e quantas palavras usou. */
    private fun lerNumero(palavras: List<String>, i: Int): Pair<Int, Int>? {
        val primeiro = palavras.getOrNull(i)?.let { numero(it) } ?: return null
        if (primeiro >= 20 && primeiro % 10 == 0 && palavras.getOrNull(i + 1) == "e") {
            val unidade = palavras.getOrNull(i + 2)?.let { numero(it) }
            if (unidade != null && unidade in 1..9) return Pair(primeiro + unidade, 3)
        }
        return Pair(primeiro, 1)
    }

    private fun temporizador(palavras: List<String>): Comando? {
        if (palavras.none { it in setOf("timer", "temporizador", "cronometro", "cronometrar") } &&
            !(palavras.first() in setOf("avise", "avisa", "lembre", "lembra") && "em" in palavras)
        ) return null
        var total = 0
        var i = 0
        while (i < palavras.size) {
            val lido = lerNumero(palavras, i)
            if (lido != null) {
                val unidade = palavras.getOrNull(i + lido.second) ?: ""
                total += when {
                    unidade.startsWith("hora") -> lido.first * 3600
                    unidade.startsWith("minuto") || unidade == "min" -> lido.first * 60
                    unidade.startsWith("segundo") -> lido.first
                    else -> 0
                }
                i += lido.second
            } else i++
        }
        return if (total > 0) Comando.Temporizador(total) else null
    }

    private fun alarme(palavras: List<String>): Comando? {
        if (palavras.none { it in setOf("alarme", "despertador", "acordar", "acorde", "acorda", "despertar") }) return null
        for (i in palavras.indices) {
            val p = palavras[i]
            // Formatos "7:30" e "7h30"
            Regex("^(\\d{1,2})[:h](\\d{2})?$").find(p)?.let { m ->
                val h = m.groupValues[1].toInt()
                val min = m.groupValues[2].toIntOrNull() ?: 0
                if (h in 0..23 && min in 0..59) return Comando.Alarme(h, min)
            }
            val lido = lerNumero(palavras, i) ?: continue
            val depois = palavras.drop(i + lido.second)
            if (lido.first !in 0..23) continue
            var minuto = 0
            val semHoras = depois.dropWhile { it == "horas" || it == "hora" || it == "h" }
            val aposE = if (semHoras.firstOrNull() == "e") semHoras.drop(1) else semHoras
            lerNumero(aposE, 0)?.let { if (it.first in 0..59) minuto = it.first }
            var hora = lido.first
            if (hora < 12 && (palavras.containsAll(listOf("da", "tarde")) || palavras.containsAll(listOf("da", "noite")))) hora += 12
            return Comando.Alarme(hora, minuto)
        }
        return null
    }
}
