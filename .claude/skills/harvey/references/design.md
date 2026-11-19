# Módulo de design, interface e vídeo

Objetivo: interface que parece feita por um bom estúdio para aquele negócio específico, e não o
modelo padrão que toda ferramenta de IA produz.

## Direção antes do CSS

Declare em três linhas e mantenha até o fim:

- **Conceito:** uma ideia com personalidade ligada ao negócio ("editorial calmo", "oficina técnica", "caderno de campo").
- **Tipografia:** no máximo duas famílias, escolhidas com intenção.
- **Paleta:** fundo, texto, um destaque.

Três ajustes, de 1 a 10, perguntados ou inferidos: ousadia do layout, intensidade de movimento, densidade de informação.

## Regras de gosto

**Tipografia.** Família com caráter em vez do padrão do sistema. Contraste real de escala (título
pelo menos 2,5 vezes o corpo). Entrelinha de 1,5 a 1,7 no corpo e de 1,05 a 1,2 em títulos.
Espaçamento entre letras negativo em títulos grandes. Linha de 60 a 75 caracteres. Algarismos
tabulares em tabelas e preços.

**Cor.** Variáveis em `:root` (`--bg`, `--fg`, `--muted`, `--accent`, `--border`). Uma cor de
destaque, usada pouco. Neutros puxados para o tom da marca. Contraste AA no mínimo. Modo escuro
desenhado, não invertido.

**Layout.** Grade com respiro e alinhamentos consistentes. Assimetria intencional quando ajuda a
hierarquia. Escala de espaçamento fixa (4, 8, 12, 16, 24, 32, 48, 64, 96). Primeiro o celular.

**Componentes.** Um raio de canto, um estilo de sombra, uma família de ícones. Botão primário
único por tela. Estados completos: normal, foco, ativo, desabilitado, carregando, erro, vazio.

**Movimento.** Pouco e com função: mostrar de onde veio, o que mudou, o que é clicável. De 150 a
300 ms, saída suave. Respeitar `prefers-reduced-motion`.

**Conteúdo.** Texto real do negócio desde o primeiro rascunho. Foto e captura reais em vez de ilustração genérica.

## Interface sem cara de IA

| Sinal | O certo |
|---|---|
| Degradê roxo-azul, brilho neon, vidro fosco em tudo | Paleta própria e superfícies sólidas |
| Tudo centralizado: herói, três cartões com ícone, depoimentos, chamada final | Estrutura que nasce do conteúdo |
| Emoji como ícone e em títulos | Ícones de uma família ou nenhum |
| Selo "✨ Novo" e pílulas decorativas acima do título | Título direto |
| Cartão dentro de cartão; borda, sombra e fundo juntos | Um recurso de separação por vez |
| Texto cinza claro ilegível sobre fundo colorido | Contraste conferido |
| Títulos genéricos ("Transforme seu negócio", "Tudo o que você precisa") | Benefício concreto, com número |
| Números e depoimentos inventados | Dado real ou nada |
| Sombra e raio diferentes em cada elemento | Sistema de medidas |
| Animação em tudo que entra na tela | Movimento só onde informa |
| Fonte padrão sem escolha | Par tipográfico com intenção |

## Auditoria e polimento (ordem fixa)

1. **Auditar:** acessibilidade (contraste, foco, semântica, rótulos, alvos de 44 px), desempenho (imagens, fontes, LCP), responsividade.
2. **Criticar:** hierarquia, ritmo, consistência, clareza do próximo passo do usuário.
3. **Normalizar:** tudo nas variáveis e na escala de espaçamento.
4. **Tipografar:** pesos, tamanhos, quebras de linha, palavras órfãs.
5. **Arranjar:** alinhamento e espaços.
6. **Esclarecer:** microtexto. Botão com verbo, erro que diz como resolver, rótulo sem jargão.
7. **Fortalecer:** vazio, carregando, erro, texto longo, conexão lenta.
8. **Encantar:** um detalhe memorável, depois de tudo acima estar certo.
9. **Conferir** no navegador, celular e desktop (`pesquisa-e-navegador.md`).

Relatório em tabela: problema · gravidade · correção aplicada · evidência.

## Vídeo de produto (HyperFrames)

- **Local:** composição em HTML e GSAP no disco, com as skills do HyperFrames
  (`npx skills add heygen-com/hyperframes`), pré-visualização e render pela linha de comando.
- **Hospedado:** projeto na HeyGen pelo conector HyperFrames, quando o usuário quer link compartilhável e render na nuvem.
- **Roteiro de 15 a 30 segundos:** gancho (0 a 3 s) · problema · produto em uso, com a interface real · prova · chamada para ação.
- Mesma direção visual da interface. Legenda sempre. Formato vertical para redes, horizontal para site.
