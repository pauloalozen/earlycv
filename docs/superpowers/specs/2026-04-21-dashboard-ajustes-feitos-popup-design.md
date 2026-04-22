# Dashboard Historico — Botao "Ajustes feitos" + Popup

## Contexto

Na rota `apps/web/src/app/dashboard/page.tsx`, cada item do historico de analises ja exibe acoes como revisar resultado e baixar arquivos quando o CV esta liberado. Falta uma acao dedicada para explicar, direto no dashboard, quais ajustes foram aplicados no CV liberado, reaproveitando os mesmos dados que ja aparecem no CTA da tela de resultado (`O que foi feito no seu CV`).

## Objetivo

Adicionar um novo botao `Ajustes feitos` no historico de analises do dashboard para itens liberados, com destaque visual no padrao atual (verde/preto), abrindo um popup com:

1. Score antes.
2. Score final apos ajustes (definido como `fit.score`).
3. Texto de `O que foi feito no seu CV` (`adaptation_notes`).

## Escopo

### Inclui

- Dashboard: enriquecimento de dados por item no server-side para alimentar o popup.
- Historico: novo botao `Ajustes feitos` no mesmo grupo de chips existente.
- Popup client-side no dashboard com visual e interacao alinhados ao projeto atual.
- Regras de exibicao para nao mostrar botao/popup vazio.

### Nao inclui

- Mudanca de contratos da API backend.
- Criacao de nova rota ou pagina dedicada para "Ajustes feitos".
- Mudancas de visual em telas admin (padrao legado).

## Fonte de dados e contratos

### Origem dos dados

Reaproveitar `getCvAdaptationContent(item.id)` em `dashboard/page.tsx` (ja usado hoje para score/improvement) para extrair tambem dados do popup por item.

### Campos usados

- `scoreAntes`: `projecao_melhoria.score_atual` (quando presente).
- `scoreFinal`: `fit.score` (definicao aprovada).
- `textoAjustes`: `adaptation_notes`.

### Regra de disponibilidade do botao

Mostrar `Ajustes feitos` somente quando:

- `actions.canDownload === true` (CV liberado), e
- existe pelo menos um dado util para popup:
  - `textoAjustes` nao vazio, ou
  - `scoreAntes` valido, ou
  - `scoreFinal` valido.

## UX/UI detalhado

## Botao no historico

- Posicao: junto dos chips ja existentes dentro de `HistoryActionLinks`.
- Dimensoes e tipografia: mesmo padrao dos demais chips (`h-8`, mesmo font-size/weight/family).
- Destaque visual: variacao no padrao visual atual (verde como destaque principal; preto como opcao de contraste), sem uso de terracota.
- Label fixa: `Ajustes feitos`.

## Popup

- Overlay central com fundo escuro transluscido, card branco, borda suave e sombra semelhante aos overlays atuais.
- Fechamento por:
  - botao `X`,
  - clique no backdrop,
  - tecla `Esc`.
- Scroll do `body` bloqueado enquanto popup estiver aberto.

### Conteudo do popup

1. Titulo: `Ajustes feitos`.
2. Subtitulo: contexto curto para a vaga analisada.
3. Bloco de score com comparacao:
   - `Score antes: {scoreAntes}` (ou `--` se ausente).
   - `Score final apos ajustes: {scoreFinal}` (ou `--` se ausente).
4. Bloco textual:
   - Label: `O que foi feito no seu CV`.
   - Corpo: `textoAjustes`.
5. Acao de fechamento: botao `Fechar`.

Observacao: quando algum campo estiver ausente, o popup continua abrindo com os dados disponiveis, mantendo clareza visual sem quebrar layout.

## Arquitetura e componentes

### 1) Dashboard server component

Arquivo: `apps/web/src/app/dashboard/page.tsx`

- Estender o mapa de sinais por item para incluir um objeto `adjustments`:
  - `scoreBefore: number | null`
  - `scoreFinal: number | null`
  - `notes: string | null`
- Passar esse objeto ao componente de acoes do historico.

### 2) Componente de acoes do historico (client)

Arquivo: `apps/web/src/app/dashboard/history-action-links.tsx`

- Estender `Props` para receber dados do popup.
- Renderizar botao `Ajustes feitos` seguindo regra de disponibilidade.
- Gerenciar estado local de abertura/fechamento do popup.
- Renderizar popup via `createPortal` (padrao consistente com overlays atuais).

## Acessibilidade e comportamento

- Botao com texto explicito e foco visivel.
- Popup com semantica de dialog (`role="dialog"`, `aria-modal="true"`, `aria-labelledby`).
- Fechamento por `Esc` e clique fora.
- Ordem de foco coerente ao abrir/fechar (foco retorna para botao de origem).

## Testes e verificacao

## Testes unitarios/componentes

- Atualizar/adicionar testes de `HistoryActionLinks` (se existentes) para cobrir:
  - exibicao condicional do botao;
  - abertura e fechamento do popup;
  - exibicao correta de score antes/final e texto.

## Verificacao manual

1. Item liberado com dados completos: botao aparece e popup mostra todos os campos.
2. Item liberado sem `adaptation_notes`, mas com score: botao aparece e popup mostra bloco de score.
3. Item nao liberado: botao nao aparece.
4. Fechamento por `X`, backdrop e `Esc` funcionando.
5. Visual do novo botao consistente com o padrao verde/preto atual.

## Riscos e mitigacoes

- **Risco:** aumento de dados carregados no dashboard.
  - **Mitigacao:** reuso da chamada de conteudo ja existente por item; apenas parse adicional de campos.
- **Risco:** variacao de formato em analises antigas.
  - **Mitigacao:** parser defensivo com `null` fallback e regra de exibicao do botao baseada em dados validos.
- **Risco:** inconsistencia visual entre popup novo e overlays atuais.
  - **Mitigacao:** reutilizar linguagem visual e transicoes ja presentes no projeto.

## Criterios de aceite

1. Em `/dashboard`, cada item com CV liberado e dados validos exibe o botao `Ajustes feitos`.
2. O botao segue o mesmo padrao de dimensao/fonte dos chips existentes e usa destaque no padrao visual atual (verde/preto).
3. Ao clicar, abre popup com `score antes`, `score final apos ajustes` (de `fit.score`) e `O que foi feito no seu CV`.
4. Popup fecha por `X`, clique fora e `Esc`.
5. Itens nao liberados ou sem dados relevantes nao exibem o botao.
