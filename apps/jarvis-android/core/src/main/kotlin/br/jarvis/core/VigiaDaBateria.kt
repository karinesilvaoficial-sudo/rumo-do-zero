package br.jarvis.core

/**
 * Decide quando vale avisar sobre a bateria: uma vez ao chegar em 20%, outra em 10% e
 * uma ao completar a carga. Cada aviso só se repete depois que a situação muda.
 */
class VigiaDaBateria {
    private var avisouBaixa = false
    private var avisouCritica = false
    private var avisouCheia = false

    /** [porcento] de 0 a 100. Devolve a frase a falar, ou `null` se não há novidade. */
    fun avaliar(porcento: Int, carregando: Boolean): String? {
        if (carregando) {
            avisouBaixa = false
            avisouCritica = false
            if (porcento >= 100 && !avisouCheia) {
                avisouCheia = true
                return "Mestre, a bateria está completamente carregada."
            }
            return null
        }
        avisouCheia = false
        if (porcento > 25) {
            avisouBaixa = false
            avisouCritica = false
            return null
        }
        if (porcento <= 10 && !avisouCritica) {
            avisouCritica = true
            avisouBaixa = true
            return "Mestre, a bateria está em $porcento por cento. Recomendo carregar agora."
        }
        if (porcento <= 20 && !avisouBaixa) {
            avisouBaixa = true
            return "Mestre, a bateria está em $porcento por cento."
        }
        return null
    }
}
