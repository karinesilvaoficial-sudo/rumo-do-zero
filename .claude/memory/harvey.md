# Memória do Harvey

<!-- Entradas mais recentes no topo. Nunca registre segredos ou dados pessoais. -->

## 2026-11-19
- Fato: Robô contra robô usa dano x0,2 e percepção de 36 m; sem isso a partida acaba em 1 minuto
- Funcionou: Testar partida inteira sem GPU: chamar __jogo.simular(dt) em laço dentro do Playwright; ?toque força os controles de celular
- Decisão: Vale da Sucata virou battle royale original (não é cópia do Free Fire): 3ª pessoa, paraquedas, 5 armas, zona que encolhe, 19 robôs, toque no celular; mapa de 220 m
- Funcionou: Testar o jogo: npm run build && npm start em apps/jogo; abrir /?teste expõe window.__jogo para automação no Playwright (precisa das flags de swiftshader)
- Decisão: Jogo Vale da Sucata fica em apps/jogo, isolado do workspace pnpm (npm próprio); backend Node + node:sqlite, sem tocar no Supabase de produção
- Preferência: Usuária quer análises críticas, com pontos fortes, pontos fracos e a correção pronta
- Fato: No ambiente de nuvem, skills.sh e planalto.gov.br ficam bloqueados pela rede; GitHub funciona
- Decisão: Harvey roda o ciclo inteiro em todo train, sem atalhos que pulam fases
- Preferência: Responder em português do Brasil
- Decisão: A skill única se chama Harvey e o gatilho é train

