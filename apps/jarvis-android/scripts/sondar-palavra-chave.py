"""Confere se a escuta de fundo reconhece "Jarvis" e não dispara com outras falas.

Gera frases com voz sintética (espeak-ng), passa pelo modelo com a mesma
gramática usada no app e mostra o que foi reconhecido.

Uso: python sondar-palavra-chave.py <pasta-do-modelo>
Requer: pip install vosk ; apt install espeak-ng ffmpeg
"""
import json
import subprocess
import sys
import wave

from vosk import KaldiRecognizer, Model

# Igual a GRAMATICA em JarvisService.kt
GRAMATICA = ["jarvis", "service", "harvest", "travis", "nervous", "jar", "[unk]"]

FRASES = [
    ("Jarvis", True),
    ("Jarvis, que horas são?", True),
    ("Jarvis abrir câmera", True),
    ("Ei Jarvis, ligar a lanterna", True),
    ("Hoje eu já vi esse filme e gostei bastante", False),
    ("Vamos jantar mais tarde na casa da Júlia", False),
    ("O jardim está cheio de flores", False),
    ("Preciso chamar o serviço de entrega amanhã cedo", False),
    ("Ela viajou para o Chaves no fim de semana", False),
]
VOZES = ["pt-br", "pt-br+f3", "pt-br+m3", "en-us"]


def reconhecer(modelo, caminho):
    with wave.open(caminho) as w:
        rec = KaldiRecognizer(modelo, w.getframerate(), json.dumps(GRAMATICA))
        while True:
            dados = w.readframes(1600)
            if not dados:
                break
            rec.AcceptWaveform(dados)
        return json.loads(rec.FinalResult()).get("text", "")


def main():
    modelo = Model(sys.argv[1])
    erros = 0
    for voz in VOZES:
        for i, (frase, esperado) in enumerate(FRASES):
            bruto, final = f"/tmp/sonda-{i}.wav", f"/tmp/sonda-{i}-16k.wav"
            subprocess.run(["espeak-ng", "-v", voz, "-s", "150", "-w", bruto, frase], check=True)
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", bruto, "-ar", "16000", "-ac", "1", final], check=True)
            texto = reconhecer(modelo, final)
            ativou = "jarvis" in texto.split()
            marca = "ok  " if ativou == esperado else "ERRO"
            erros += ativou != esperado
            print(f"{marca} [{voz}] {frase!r} -> {texto!r}")
    print(f"{erros} resultado(s) diferente(s) do esperado")


if __name__ == "__main__":
    main()
