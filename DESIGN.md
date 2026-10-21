---
name: Clínica Fiscal
description: Tema padrão da ferramenta de balcão para emitir NFS-e em clínicas — bancada morna, superfícies brancas, grafite nas ações, linhas finas em taupe claro, e a nota como o papel mais quente.
colors:
  graphite: "#404041"
  ink: "#29292a"
  copy: "#6b5f59"
  line: "#e2d8d1"
  field-line: "#a09087"
  mist: "#f3ede9"
  canvas: "#fbf8f6"
  white: "#ffffff"
  hover: "#fcefe8"
  taupe: "#a28a7f"
  taupe-deep: "#796960"
  brand: "#735f56"
  blush: "#fde6dc"
  paper: "#fff1eb"
  status-authorized: "#3f6b52"
  status-rejected: "#8a4b46"
typography:
  heading:
    fontFamily: "'Bricolage Grotesque Variable', 'Geist Variable', sans-serif"
    fontWeight: 500
    letterSpacing: "-0.025em"
    fontVariation: "'opsz' 96, 'wdth' 95"
  page-title:
    fontFamily: "'Bricolage Grotesque Variable', 'Geist Variable', sans-serif"
    fontSize: "1.875rem"
    fontWeight: 500
    lineHeight: 1.25
  total:
    fontFamily: "'Bricolage Grotesque Variable', 'Geist Variable', sans-serif"
    fontSize: "1.875rem"
    fontWeight: 500
  body:
    fontFamily: "'Geist Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    fontFeature: "'cv11', 'ss01'"
  label:
    fontFamily: "'Geist Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.14em"
rounded:
  field: "12px"
  sm: "8px"
  md: "10px"
  card: "16px"
  pill: "999px"
spacing:
  card: "16px"
  nota-padding: "24px"
  nota-padding-sm: "32px"
  sidebar: "15rem"
components:
  button-primary:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    height: "40px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
  button-outline:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "40px"
    padding: "0 10px"
  nota-viva:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  sidebar:
    backgroundColor: "{colors.mist}"
    width: "15rem"
---

# Design System: Clínica Fiscal (tema padrão)

## Overview

**Creative North Star: "A Nota Sobre a Bancada"**

Uma bancada clínica morna e silenciosa: o fundo é um branco puxado para o taupe (#FBF8F6), e sobre ele assentam superfícies brancas (cartões, tabelas, campos) com linhas finas em taupe claro. Grafite fica com as ações; a nota fiscal, em papel blush com hairline taupe, segue sendo a peça mais quente. É o tema padrão, pensado para o balcão de qualquer clínica; cada instalação troca os tokens de cor em `web/src/index.css` (`:root`) e o nome em `CLINIC_NAME`.

Densidade operacional, não vitrine: o título em tinta, uma ação em pílula grafite, e a folha à direita que se preenche enquanto a recepção escolhe. Plano por padrão; sombra só em camadas que realmente flutuam (menus, diálogos). Tema único claro (`color-scheme: light`).

Exceção deliberada ao site: tipografia Bricolage Grotesque Variable (títulos) e Geist Variable (texto e números), no lugar de Telegraf/Roboto.

**Key Characteristics:**
- Bancada morna + superfícies brancas + grafite; a nota é o ponto mais quente.
- Linhas de 1 px (#E2D8D1) em vez de sombras; campos com borda mais firme (#A09087, 3:1).
- Pílula só em ações; campos 12 px; cartões e listas 16 px (ver Shapes).
- Números sempre tabulares; rótulos em caixa-alta espaçada no taupe profundo.
- Alvos de toque de 44 px em ponteiro grosso.

## Colors

Paleta restrita da marca: neutros frios quase sem croma, um taupe quente e um rosado só para o papel.

### Primary
- **Grafite da Clínica** (#404041, `--primary`): fundo do botão primário, estado "Pronta". Hover escurece para tinta.
- **Taupe de Marca** (#735F56, `--brand` / `--ring`): rótulos `.rotulo`, links, parte "Fiscal" da marca, anel de foco (~6:1 sobre branco).

### Secondary
- **Taupe** (#A28A7F, `--taupe`): hairline da nota (55% de opacidade), divisórias internas (45%), borda de hover em opções.
- **Taupe Profundo** (#796960, `--taupe-deep`, também `--status-processing`): estados em andamento.

### Tertiary
- **Blush** (#FDE6DC, `--blush`): reservado; sem uso em superfície hoje.
- **Papel** (#FFF1EB, `--paper` / `--accent`): fundo da nota (`.folha`) e seleção/hover suave de opções.

### Neutral (puxados para o taupe)
- **Bancada** (#FBF8F6, `--background`): fundo da página.
- **Branco** (#FFFFFF, `--card`): cartões, tabelas, campos, popovers, botão de contorno e aba ativa; assentam sobre a bancada sem sombra.
- **Tinta** (#29292A, `--foreground`): texto principal, linha de total da nota, hover do botão primário.
- **Texto Corrido** (#6B5F59, `--muted-foreground`): texto secundário, rascunho, cancelada (≥5,3:1 em todas as superfícies).
- **Névoa** (#F3EDE9, `--sidebar` / `--secondary` / `--muted`): navegação lateral, cabeçalho de tabela, trilho de abas, botão secundário.
- **Linha** (#E2D8D1, `--border`): divisórias, tabelas, cartões, cabeçalho de página.
- **Linha de campo** (#A09087, `--input`): borda de inputs, selects e gatilhos de busca (3:1 sobre branco).
- **Hover** (#FCEFE8, `--accent`): hover/seleção suave de linhas e opções. Seleção de texto em blush.

### Status (vocabulário de cor das notas)
Texto + borda a 40% de opacidade sobre branco, com ponto sólido (`size-1.5`); nunca fundo preenchido.
- **Rascunho** `DRAFT`: #6B5F59
- **Pronta** `READY`: #404041
- **Enviando / Processando / Cancelando** `SUBMITTING`, `PROCESSING`, `CANCELLATION_REQUESTED`: #796960
- **Emitida** `AUTHORIZED`: #3F6B52 (único verde do sistema)
- **Erro / Erro no cancelamento** `REJECTED`, `CANCELLATION_ERROR`: #8A4B46
- **Cancelada** `CANCELLED`: #6B5F59, texto riscado (`line-through`)
- **Destrutivo** (`--destructive`): #8A4B46, mesmo tom de erro; botão destrutivo é `bg-destructive/10` com texto destrutivo. Empresa em produção usa borda/texto destrutivo como alerta.

### Named Rules
**A Regra do Papel Mais Quente.** Papel/blush como superfície só na nota (e no hover suave #FCEFE8). A bancada e a névoa são mornas, mas nunca rosadas; cartões e campos são brancos.
**A Regra do Estado em Texto.** Status nunca é comunicado só por cor: sempre rótulo em português ao lado do ponto.

## Typography

**Display Font:** Bricolage Grotesque Variable (com Geist Variable, sans-serif)
**Body Font:** Geist Variable (com ui-sans-serif, system-ui)

**Character:** Bricolage dá voz humana e levemente condensada (`opsz 96`, `wdth 95`) aos títulos; Geist é neutro e preciso para dados. Ambos via `@fontsource-variable`.

### Hierarchy
- **Título de página** (500, 1.875rem/`text-3xl`, lh 1.25, ls -0.025em): `h1` em `PageHeader`, `text-wrap: balance`.
- **Título de seção** (500–600, 1.125rem/`text-lg`): `h2` das listas no painel.
- **Título da nota** (500, 1.5rem/`text-2xl`): "Nº …" ou estado da nota.
- **Total** (Bricolage 500, 1.875rem, `.tabular`): valor total na base da nota.
- **Corpo** (400, 0.875rem/`text-sm`; 1rem em campos até `md`): interface geral.
- **Rótulo `.rotulo`** (600, 0.75rem, ls 0.14em, caixa-alta, #735F56): rótulos de bloco da nota e seções.
- **Números** `.tabular` (`tabular-nums`): CPF, CNPJ, valores, datas. Geist com `cv11`, `ss01` globais.

### Named Rules
**A Regra dos Dígitos Alinhados.** Todo valor monetário, documento ou data usa `.tabular`.
**A Regra do Rótulo Taupe.** Rótulo de marca é sempre caixa-alta 600 com 0.14em, em #735F56; nunca em cinza.

## Layout

Casca em duas colunas a partir de `md`: barra lateral de 15rem (`md:grid-cols-[15rem_1fr]`), conteúdo `max-w-6xl` com padding `px-4 / sm:px-6 / lg:px-10`, `py-6 / lg:py-10`. No celular: barra fixa de 56 px (`h-14`) com marca, "Nova nota" e menu; o menu abre em largura total com itens de 52 px (`h-13`); no desktop os itens têm 40 px.

Cabeçalho de página: `mb-8`, `pb-6`, `border-b`, título à esquerda e ações em pílula à direita. A home é uma só, igual para todos os papéis, nesta ordem: "Este mês" (três células; no celular, uma linha por empresa; a célula Total é branca com linha superior grafite, ecoando o rodapé da nota), avisos ("2 notas com erro"), a fila "Para emitir agora" em largura total (linhas de 64 px com a ação em pílula), "Emitidas hoje" (mini-folhas) e "Últimas notas". Barra lateral em dois grupos com `.rotulo`: "Operação" e "Cadastros", os mesmos itens para todos. Na nota e em `/notas/nova`: controles à esquerda (`minmax(0,24rem)`), folha blush à direita. Ritmo vertical por gaps de 8/12/24/32 px, não uniforme.

Toque: `@media (pointer: coarse)` força `min-height: 44px` em botões, abas, rádios, inputs e textarea; botões só-ícone `min-width: 44px`. `prefers-reduced-motion` reduz animações a 0.01 ms.

## Elevation & Depth

Plano por padrão. A profundidade vem de linhas de 1 px e do contraste névoa/branco, não de sombra. A nota é diferenciada pelo papel e pela hairline taupe, sem sombra. Sombra existe só em camadas flutuantes: `--shadow-md: 0 20px 55px rgb(64 64 65 / 0.08)` e `--shadow-lg: 0 20px 55px rgb(64 64 65 / 0.12)` (popover usa `shadow-md` mais `ring-1 ring-foreground/10`). Aba ativa da variante padrão leva `shadow-sm`.

### Named Rules
**A Regra do Plano em Repouso.** Superfícies fixas (cartões, tabelas, nota, barra lateral) nunca têm sombra; só menus, popovers e diálogos.

## Shapes

Pílula (`rounded-full`, 999px) só em ações: botões, abas (controle segmentado) e chips de escolha. O selo de status e os selos de ambiente são `rounded-md` para não parecerem botão. Campos e selects em 12 px (`rounded-lg` = `--radius` 0.75rem). Cartões, listas, tabelas e a nota usam `rounded-xl`, que neste tema resolve para 16 px (`--radius-xl: 1rem`). Carimbo da nota: borda 1.5 px, `rounded-md`, rotação -4°, letras 0.12em em Bricolage. Itens de navegação e opções: 12 px / 16 px.

## Components

### Buttons
- **Shape:** pílula (999px), `font-semibold`, `text-sm`.
- **Primary:** fundo grafite #404041, texto branco; altura 40 px (`h-10`, px 16), `lg` 44 px, `sm` 36 px, `xs` 28 px; ícone 40 px. Hover para tinta #29292A.
- **Outline:** borda #E2D8D1, fundo branco, hover névoa. **Secondary:** fundo névoa. **Ghost:** só hover névoa. **Destructive:** `bg-destructive/10`, texto #8A4B46. **Link:** sublinhado no hover.
- **Foco:** `border-ring` + `ring-3 ring-ring/50` (#735F56). Press: `translate-y-px`. Desabilitado: a variante primária fica névoa com texto secundário (opacidade 100%), para ler como "ainda não" e não como "quebrado"; as demais variantes a 50%. Um primário desabilitado vem sempre com o motivo em texto normal ao lado ("Marque 'Revisei os dados'").

### Inputs / Fields
- **Style:** altura 40 px, 12 px de raio, borda #A09087 (3:1), fundo branco, texto 1rem (0.875rem de `md`). Foco com borda e anel #735F56 a 50%. Erro: borda e anel destrutivos. `Campo` empilha rótulo, controle e mensagem (`text-xs`, destrutivo para erro, cinza para dica) com `gap-1.5`.

### Tabs
Trilho em pílula névoa de 40 px; aba ativa em branco com `shadow-sm`; inativa em `text-foreground/60`. Usadas como filtro de status em Notas.

### Status Badge
Selo de 24 px com `rounded-md` (não é ação, então não é pílula), borda a 40% na cor do status, fundo branco, ponto de 6 px + rótulo `text-xs` 600. Cancelada riscada.

### Navigation
Barra lateral névoa #F3EDE9, borda direita; item ativo em cartão branco `font-semibold`, inativo em cinza, hover branco; raio 12 px, ícone Lucide 16 px. Marca: o nome da clínica (`CLINIC_NAME`) em tinta + "Fiscal" em #735F56, Bricolage 500.

### Nota Viva (componente de assinatura)
Documento `.folha`: fundo #FFF1EB, borda 1 px taupe a 55%, `rounded-xl`, padding 24/32 px, sem sombra. Cabeçalho com `.rotulo` "Nota fiscal de serviço · NFS-e", número em 1.5rem; três blocos (Emitente, Tomador, Profissional) em `dl` que vira 3 colunas pela largura da própria folha (`@container`, `@xl:grid-cols-3`), nunca pelo viewport; serviços em lista com divisórias taupe a 40%; rodapé com linha superior em tinta e total em Bricolage 1.875rem tabular. Campos vazios em cinza ("escolha o paciente"). Estados finais ganham `.carimbo` rotacionado na cor do status.

### Carimbo que pousa
Quando a nota passa a Emitida com a página aberta, o `.carimbo` entra com `@keyframes pousar`: `scale(1.25) rotate(-10deg)` e opacidade 0 → `scale(1) rotate(-4deg)` e opacidade 1, 280 ms, `cubic-bezier(0.16, 1, 0.3, 1)` (classe `carimbo-pousa`). Ao abrir uma nota já emitida, o carimbo aparece parado. Cada serviço entra na folha com `animate-in fade-in slide-in-from-bottom-1` em 200 ms. Só `transform` e `opacity`; `prefers-reduced-motion` zera tudo.

### Folha-fantasma (`FolhaVazia`)
O estado vazio de qualquer lista de notas: contorno tracejado em taupe a 55%, fundo papel a 40%, três linhas de esqueleto (`h-2`, taupe a 20%) e uma frase do que fazer, com a ação abaixo quando houver ("Nova nota"). Substitui as caixas tracejadas cinza na home, em Notas e em Relatórios.

### Dinheiro (valores grandes)
"R$" em 0,6 em na cor da marca, alinhado ao topo; o número em Bricolage com `font-variation-settings: 'opsz' 120, 'wdth' 90` e dígitos tabulares. O tamanho vem de quem usa: total da nota (`text-3xl`), "Este mês" (`text-2xl`), resumo de Relatórios (`text-4xl`), barra de ação móvel (`text-lg`). Nunca em tabela nem em linha de lista.

### Barra de ação móvel
Em `/notas/:id`, até `xl`: barra fixa no rodapé, branca, linha superior #E2D8D1, `padding-bottom` com `env(safe-area-inset-bottom)`; total à esquerda em `Dinheiro text-lg`, ação primária à direita ("Revisar e emitir", "Emitir NFS-e", "Sincronizar" ou "Baixar PDF"). O conteúdo ganha `pb-24` para não ficar atrás dela. Some a partir de `xl`, onde a coluna de controles já aparece.

### Mini-folha
Na faixa "Emitidas hoje": `.folha` de 120 × 72 px (`w-30 h-18`), `rounded-lg`, nome do paciente em uma linha, valor tabular e "nº 1234" em `text-[0.65rem]`. Rolável no celular.

### Tendência (Relatórios)
Small multiples: uma linha por empresa, 12 barras em `grid-cols-12` com trilho de `h-10`, o mês do filtro em grafite e os demais em taupe a 45%; rótulo compacto ("12,3 mil") só no mês escolhido e no maior; frase "+12% sobre setembro" ao lado do nome da empresa. Cada barra é um `<button>` com `aria-label="outubro de 2026, R$ 12.345,00"` e `aria-pressed`; clicar muda o mês.

### Cards / Containers
Listas e tabelas: fundo branco sobre a bancada, borda #E2D8D1, cabeçalho de tabela em névoa, `rounded-xl`, sem sombra; vazios com a folha-fantasma. O `Card` do shadcn usa `ring-1 ring-foreground/10` em vez de borda. Opção selecionável: `border-primary bg-accent` (papel) ao marcar, `hover:border-taupe`.

## Do's and Don'ts

### Do:
- **Do** deixar a nota (#FFF1EB, hairline taupe) como a superfície mais quente; bancada morna ao fundo, branco nas superfícies.
- **Do** usar pílula em ações e `rounded-lg` (12 px) em campos.
- **Do** mostrar status como ponto + rótulo em português + borda a 40%, com as cores da tabela acima.
- **Do** aplicar `.tabular` em CPF, CNPJ, valores e datas, e `.rotulo` nos rótulos de bloco.
- **Do** garantir 44 px de toque em ponteiro grosso e foco visível #735F56.
- **Do** manter ações do item (editar, remover) dentro da nota editável, com a nota se preenchendo ao vivo.

### Don't:
- **Don't** montar a emissão como formulário de prefeitura nem como painel de cartões; o documento é o centro.
- **Don't** usar sombra em cartões, tabelas ou na nota; só em menus, popovers e diálogos.
- **Don't** usar blush/papel como fundo de tela, cartão de métrica ou botão.
- **Don't** introduzir verde/vermelho/azul vivos; o único verde é #3F6B52 de "Emitida" e o erro é #8A4B46.
- **Don't** comunicar estado só por cor, nem esconder o rótulo do status.
- **Don't** usar Telegraf/Roboto ou uma terceira família; só Bricolage (títulos) e Geist (texto e números).
- **Don't** usar texto de rótulo em cinza claro ou em taupe #A28A7F sobre branco (contraste); o taupe de texto é #735F56.
- **Don't** depender de modo escuro: a interface é só clara.
- **Don't** mostrar "Cancelar nota" como primeira ação visível depois de um sucesso. Depois de emitir, a ordem é Baixar PDF → WhatsApp / Imprimir → Nova nota → Mais (XML, Cancelar).
- **Don't** animar nada além de `transform` e `opacity`, nem acima de 300 ms; a animação acontece num momento com significado (o carimbo pousa, o serviço entra), nunca como enfeite.
