# RUMO — comercial 10s (Remotion)

1080×1920 · 9:16 · 30 fps · 300 frames · H.264. Sem áudio (nenhuma locução/música foi gerada; inserir locução a partir de 0,0s em edição).

```bash
npm install
npm run studio            # preview/edição
npm run render            # renders/rumo_motion_10s.mp4
npm run render:sem-texto  # renders/rumo_motion_10s_sem_texto.mp4
npm run thumb             # renders/rumo_thumbnail.png
```

Estrutura: `src/theme.ts` (cores, timing, easings) · `src/components/` (fundo volumétrico, tipografia cinética por caractere) · `src/scenes/` (HookAndTurn 0–4,3s, Product 4,3–7,7s, Finale 7,7–10s). `reference/` contém os keyframes originais.

Interface é demonstrativa: sem valores, preços, percentuais ou dados bancários. `remotion.config.ts` usa o Chromium local se existir.
