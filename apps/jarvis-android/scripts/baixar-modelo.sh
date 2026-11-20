#!/usr/bin/env bash
# Baixa o modelo de voz (Vosk, ~40 MB) usado para reconhecer a palavra "Jarvis"
# sem internet, e coloca dentro dos recursos do app.
# É o modelo em inglês de propósito: o modelo em português não tem "Jarvis" no
# vocabulário e ignora a palavra. Ele só é usado para o nome; os comandos são
# entendidos em português pelo reconhecedor do próprio Android.
set -euo pipefail
cd "$(dirname "$0")/.."

destino=app/src/main/assets/model-en
modelo=vosk-model-small-en-us-0.15

if [ -f "$destino/uuid" ]; then
  echo "Modelo já está em $destino"
  exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fL --retry 3 -o "$tmp/modelo.zip" "https://alphacephei.com/vosk/models/$modelo.zip"
unzip -q "$tmp/modelo.zip" -d "$tmp"
rm -rf "$destino"
mkdir -p "$(dirname "$destino")"
mv "$tmp/$modelo" "$destino"
# O app usa este arquivo para saber se precisa copiar o modelo de novo após uma atualização.
echo "$modelo" > "$destino/uuid"
echo "Modelo instalado em $destino"
