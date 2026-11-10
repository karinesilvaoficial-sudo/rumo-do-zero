# RUMO — comercial 10s (Remotion)

1080×1920 · 9:16 · 30 fps · 300 frames · H.264 + AAC.

Áudio (ElevenLabs, em `audio/`): locução pt-BR (voz "Brian", modelo multilingual v2) em 4 trechos alinhados às cenas (0,06s · 2,35s · 4,55s · 7,76s), trilha original gerada por IA (sound-generation) com ducking, e whoosh nas transições (1,95s · 4,15s · 7,55s). Mix a -14 LUFS. A versão sem texto leva só trilha + efeitos. Remux: ver comandos ffmpeg no histórico do commit.

```bash
npm install
npm run studio            # preview/edição
npm run render            # renders/rumo_motion_10s.mp4
npm run render:sem-texto  # renders/rumo_motion_10s_sem_texto.mp4
npm run thumb             # renders/rumo_thumbnail.png
```

Estrutura: `src/theme.ts` (cores, timing, easings) · `src/components/` (fundo volumétrico, tipografia cinética por caractere) · `src/scenes/` (HookAndTurn 0–4,3s, Product 4,3–7,7s, Finale 7,7–10s). `reference/` contém os keyframes originais.

Interface é demonstrativa: sem valores, preços, percentuais ou dados bancários. `remotion.config.ts` usa o Chromium local se existir.

---

# Comercial 2 — "Tome jeito" (15s, 3D)

`npm run render:jeito` → `renders/rumo_tome_jeito_15s.mp4` (1080×1920 · 30 fps · 450 frames · áudio embutido).

- **Three.js real** (`@remotion/three`): moedas metálicas PBR com borda serrilhada e relevo, cartões com clearcoat, contas de papel curvadas, celular de titânio com a **tela do app renderizada ao vivo como textura** (canvas por frame). Iluminação por environment map + luzes azuis/douradas. Render usa `--gl=swangle` (WebGL por software, funciona sem GPU).
- **Skeleton de edição** em `src/jeito/edl.ts`: beats, congelamento, organização, falas e efeitos sonoros num único arquivo. Mudou o tempo aqui, o filme todo acompanha.
- **Skeleton da IA na tela**: blocos cinza com brilho percorrendo enquanto "IA analisando", que se resolvem em gastos por categoria, plano de ação e assistente.
- Áudio (`public/jeito/`): locução ElevenLabs, trilha e 9 efeitos, mixados dentro do Remotion com ducking da trilha sob a voz.
