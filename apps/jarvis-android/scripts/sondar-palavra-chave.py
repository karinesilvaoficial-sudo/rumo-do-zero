"""Confere como o modelo de voz escreve a palavra "Jarvis".

Gera frases com voz sintética (espeak-ng), passa pelo modelo e mostra o texto
reconhecido. Serve para manter a lista PalavraChave.formas alinhada ao modelo.

Uso: python sondar-palavra-chave.py <pasta-do-modelo>
Requer: pip install vosk ; apt install espeak-ng
"""
import json
import subprocess
import sys
import wave

from vosk import KaldiRecognizer, Model

FRASES = [
    ("Jarvis", True),
    ("Jarvis, que horas são?", True),
    ("Jarvis abrir câmera", True),
    ("Ei Jarvis, ligar a lanterna", True),
    ("Jarvis, abrir calculadora", True),
    ("Hoje eu já vi esse filme e gostei bastante", False),
    ("Vamos jantar mais tarde na casa da Júlia", False),
    ("O jardim está cheio de flores", False),
]
VOZES = ["pt-br", "pt-br+f3", "pt-br+m3"]


def reconhecer(modelo, caminho, gramatica=None):
    with wave.open(caminho) as w:
        rec = KaldiRecognizer(modelo, w.getframerate(), gramatica) if gramatica else KaldiRecognizer(modelo, w.getframerate())
        while True:
            dados = w.readframes(4000)
            if not dados:
                break
            rec.AcceptWaveform(dados)
        return json.loads(rec.FinalResult()).get("text", "")


def main():
    modelo = Model(sys.argv[1])
    for voz in VOZES:
        for i, (frase, _) in enumerate(FRASES):
            bruto = f"/tmp/sonda-{i}.wav"
            final = f"/tmp/sonda-{i}-16k.wav"
            subprocess.run(["espeak-ng", "-v", voz, "-s", "150", "-w", bruto, frase], check=True)
            subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", bruto, "-ar", "16000", "-ac", "1", final], check=True)
            livre = reconhecer(modelo, final)
            print(f"[{voz}] {frase!r}\n    livre: {livre!r}")
    print("--- com gramática restrita (aviso abaixo indica palavra fora do vocabulário) ---")
    for i, (frase, _) in enumerate(FRASES):
        print(f"{frase!r} -> {reconhecer(modelo, f'/tmp/sonda-{i}-16k.wav', json.dumps(['jarvis', '[unk]']))!r}")


if __name__ == "__main__":
    main()
