# PROMPT MESTRE — RUMO | MOTION GRAPHICS 10 SEGUNDOS

Você é um diretor de arte especializado em motion design premium e um engenheiro audiovisual sênior, com domínio de Remotion, React, TypeScript, SVG e animações 2D/3D. Sua missão é PRODUZIR, RENDERIZAR e ENTREGAR um vídeo vertical MP4 de 10 segundos para apresentar o produto RUMO, não apenas descrever como ele seria.

## Produto e posicionamento
RUMO é uma plataforma de organização financeira com apoio de inteligência artificial, voltada a pessoas físicas e pequenos negócios. Ajuda a organizar contas, compreender despesas, planejar dívidas, definir metas, desenhar um plano de ação e explorar possibilidades de renda. A IA orienta a tomada de decisão; ela não garante ganhos nem quita dívidas automaticamente. Nesta peça, priorize o público pessoa física e a dor de não entender para onde vai o próprio dinheiro.

## Arquivos entregues
- cenas/cena_01.png ... cena_04.png: quatro keyframes de composição, 1080x1920. São referências de direção de arte, não o vídeo pronto.
- cenas/cena_01.svg ... cena_04.svg: versões vetoriais editáveis dos keyframes. Use ou desconstrua essas camadas.
- referencias/: painéis de conceito visual gerados por IA. São MOODBOARDS, não screenshots reais nem prova de resultados. Não tome valores, estatísticas, preços ou retratos nesses moodboards como fatos do produto.

## Especificações técnicas obrigatórias
- Saída: ./renders/rumo_motion_10s.mp4, H.264, 1080x1920, proporção 9:16, 30 fps, 300 frames exatos, duração 10,00s. Incluir versão ./renders/rumo_motion_10s_sem_texto.mp4 se viável e thumbnail PNG.
- Implementação preferencial: Remotion + React + TypeScript, CSS/SVG e opcional Three.js para profundidade real em smartphones. Criar projeto autoexecutável com package.json, src, scripts e README.
- Animar camadas de VERDADE: texto isolado, números/caracteres por posição, gráficos com morph/trim paths, cards em parallax, luz volumétrica e UI com máscara. NÃO produzir slideshow estático de quatro JPGs com zoom superficial.
- O visual: direção de arte de software financeiro premium, fundo #020915 e #07152C, azul elétrico #0A90FF, ciano #36DDFF, branco #FFFFFF, ouro discreto #FFBF55 apenas como acento. Tipografia Inter; sem aparência de cassino ou promessa de enriquecer rapidamente.
- Movimento: 60 fps como referência de fluidez se possível no preview, export obrigatório 30 fps. Easing customizado, spring controlado, motion blur quando disponível, glow moderado, depth, partículas mínimas, transições por energia azul/corte de match motion. Nenhuma transição genérica aleatória.
- Safe zones para Reels/Stories: todos os textos essenciais e CTA devem ficar confortavelmente afastados das bordas, da legenda inferior e dos ícones laterais da plataforma; nunca cortar no recorte do feed.

## Storyboard / timing (EXATO)
**0,00–2,20 s | HOOK:** fundo escuro, pequenas contas abstratas dispersas, letras em stagger surgindo com leve glitch de organização, texto: “SEU DINHEIRO ENTRA.” / “MAS PARA ONDE VAI?”. Enfatize “ONDE VAI?” em ciano. Travelling leve para dentro.
**2,20–4,30 s | VIRADA:** trilha de luz azul atravessa e realinha cards bagunçados, texto: “TROQUE O DESCONTROLE POR DIREÇÃO.” Três chips entram organicamente: “ORGANIZE”, “PLANEJE”, “EVOLUA”. Os chips são simbólicos, sem dados inventados.
**4,30–7,70 s | PRODUTO:** smartphone 3D ou pseudo-3D gira 8–12° e trava frontalmente. Interface demonstrativa premium com cabeçalho RUMO, módulo “Plano financeiro”, categorias “Metas”, “Dívidas” e “Assistente com IA”. Painéis de interface entram em sequência; progressos podem ser apenas abstratos, sem percentual monetário ou evolução numérica inventados. Texto curto: “ORGANIZAÇÃO + PLANO DE AÇÃO + IA”.
**7,70–10,00 s | FECHAMENTO:** UI dissolve em partículas discretas e revela marca “RUMO” sobre curva ascendente azul, frase “SUA VIDA FINANCEIRA NA DIREÇÃO CERTA.” e CTA “CONHEÇA O RUMO”. Hold final mínimo de 0,7 s para legibilidade. Final com logo centralizado, sem fade preto.

## Locução opcional (10 s, voz portuguesa do Brasil, segura, madura e convincente)
“Seu dinheiro entra, mas para onde vai? Com o RUMO, organize suas finanças, entenda os próximos passos e avance com inteligência. RUMO: direção para suas finanças.”
Se a locução não couber em 10s com dicção natural, reduzir o texto, não acelerar artificialmente. Música eletrônica original discreta com pulso premium e 3 efeitos UI curtos, sem usar música comercial. Não baixar nem incluir música protegida. Caso não consiga gerar áudio com recursos locais, renderizar vídeo silencioso e descrever o ponto de inserção da locução — nunca fingir que áudio foi produzido.

## Requisitos de qualidade e fidelidade
1. Use cenas SVG como base para extração e reconstrução de objetos em camadas; PNGs definem a direção visual.
2. Se logotipo oficial e captura real de telas forem fornecidos posteriormente, substitua os conceitos sem alterar a temporalidade. Não alegue que a UI de referência é uma captura funcional real.
3. Não inserir preços, porcentagens, supostos depoimentos, contas bancárias, integrações Open Finance, promessa de aumentar renda ou rentabilidade, nem informações não verificadas.
4. Não usar personagens humanos dos moodboards como representantes reais da marca; são apenas referências conceituais.
5. Garantir hierarquia: um foco visual por instante; até 2 linhas grandes simultâneas, CTA legível.
6. Evitar texto deformado, flicker visual, glitches excessivos, artefatos de borda, safe-zone violada e telas ilegíveis.
7. A interface deve ser demonstrativa. Dados financeiros reais devem vir apenas de uma fonte autorizada que eu forneça.

## Execute, não pare na arquitetura
A. Inspecione os assets; B. monte o projeto; C. renderize os 300 frames; D. confira os frames 0, 60, 129, 231, 270, 299 por screenshot; E. valide resolução, codec, duração e existência dos arquivos com ffprobe; F. corrija antes da entrega; G. entregue o caminho do MP4 e código-fonte. Em falha de ferramenta, reporte exatamente qual dependência faltou, não alegue render bem-sucedido.

Critério de aceite: quero um filme de motion graphics que pareça um anúncio de fintech de alto padrão, não um PowerPoint animado. Priorize ritmo, clareza da proposta, identidade consistente e legibilidade real no celular.
