#!/usr/bin/env bash
# Baixa o modelo de voz em português (Vosk, ~30 MB) usado para reconhecer
# a palavra "Jarvis" sem internet, e coloca dentro dos recursos do app.
set -euo pipefail
cd "$(dirname "$0")/.."

destino=app/src/main/assets/model-pt
modelo=vosk-model-small-pt-0.3

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
