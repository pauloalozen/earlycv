# Design: Ajuste de score em /adaptar/resultado + download de JSON bruto para admin

## Contexto

O prompt da IA que gera a analise de CV foi ajustado: a IA nao calcula mais score final nem campos agregados de score. A IA passa a entregar evidencias, listas, pontos por item, diagnostico textual, campos presentes/ausentes e problemas de formatacao. Todo score exibido no produto deve ser calculado internamente pelo sistema.

A rota alvo continua sendo `apps/web/src/app/adaptar/resultado/page.tsx`, usando `normalizeData` em `apps/web/src/app/adaptar/resultado/normalize-data.ts`.

Objetivos desta mudanca:

1. Recalcular score de forma deterministica no frontend sem depender de score retornado pela IA.
2. Consolidar formulas oficiais por secao com clamp obrigatorio na exibicao.
3. Preservar a CTA com download de JSON bruto para admin/superadmin para auditoria.

## Requisitos funcionais

### Regra de score (fonte de verdade no sistema)

1. A IA nao deve ser fonte de nenhum score final/intermediario.
2. O sistema calcula:
   - `scoreAtualBase`
   - `pontosDisponiveisBase`
   - `scoreAposLiberarBase`
   - `scoreAposLiberarInterativo`
   - qualquer score derivado exibido na interface.
3. `keywords.ausentes` nao entram automaticamente no score apos liberar.
4. `keywords.ausentes` so entram via fluxo interativo quando selecionadas manualmente pelo usuario.
5. Clamp obrigatorio para todo score exibido: minimo `0`, maximo `100`.

### Regra do botao admin

Na secao final CTA de `/adaptar/resultado`:

- Exibir botao de download de JSON bruto apenas para usuario autenticado com papel `admin` ou `superadmin`.
- O arquivo deve conter exatamente o payload bruto recebido da IA para a tela (sem `normalizeData`, sem tratamento adicional de estrutura/conteudo).

## Entradas da IA e layout esperado

### Campos aceitos da IA para calculo interno

- `positivos[]` com `pontos`
- `ajustes_conteudo[]` com `pontos`
- `ajustes_indisponiveis[]` com `pontos`
- `keywords.presentes[]` com `pontos`
- `keywords.ausentes[]` com `pontos`
- `formato_cv.problemas[]` com `impacto`
- `formato_cv.campos[]` com `presente`

### Layout minimo esperado da IA

```json
{
  "vaga": {},
  "fit": {},
  "secoes": {
    "experiencia": {
      "max": 40,
      "criterio": ""
    },
    "competencias": {
      "max": 40,
      "criterio": ""
    },
    "formatacao": {
      "max": 20,
      "criterio": ""
    }
  },
  "positivos": [],
  "ajustes_conteudo": [],
  "ajustes_indisponiveis": [],
  "keywords": {
    "presentes": [],
    "ausentes": []
  },
  "formato_cv": {
    "resumo": "",
    "problemas": [],
    "campos": []
  }
}
```

### Campos que NAO podem ser dependencia da IA

Nao incluir nem consumir como entrada vinda da IA:

- `ATS Score`
- `score atual`
- `scoreAtual`
- `score_atual`
- `score apos liberar ajustes`
- `scoreAposLiberar`
- `score pos otimizacao`
- `pontos disponiveis`
- `pontosDisponiveis`
- `pontos_disponiveis`
- `secoes.formatacao.score`
- `ats_score`
- `score_apos_liberar`

## Escopo tecnico

### Arquivos principais

- `apps/web/src/app/adaptar/resultado/normalize-data.ts`
- `apps/web/src/app/adaptar/resultado/page.tsx`
- `apps/web/src/lib/session-actions.ts`
- `apps/web/src/app/adaptar/resultado/page.normalize.test.ts`
- (novo) `apps/web/src/lib/session-actions.spec.ts` (se necessario para cobertura de novo campo)

### Arquitetura e fluxo de dados

1. `normalizeData` retorna agregados base calculados internamente, usando apenas pontos/listas/diagnosticos da IA.
2. `normalizeData` nao usa score retornado da IA porque esse score nao faz parte do novo contrato.
3. `page.tsx` usa os agregados base e aplica somente o bonus interativo de keywords ausentes selecionadas manualmente.
4. `page.tsx` aplica clamp de score em `[0, 100]` para toda exibicao de score.
5. `getAuthStatus` expõe o papel interno do usuario para condicionar renderizacao do botao admin.
6. O botao admin serializa e baixa o `rawData` atual da tela em `.json`.

## Detalhamento oficial de calculo

### Secao 1 — Experiencia Profissional (orcamento teorico = 40)

Formula conceitual:

`Total Pontos Secao 1 = sum(positivos[].pontos) + sum(ajustes_conteudo[].pontos) + sum(ajustes_indisponiveis[].pontos)`

Definicoes:

- `positivos[].pontos`: pontos ja comprovados no CV.
- `ajustes_conteudo[].pontos`: pontos recuperaveis por adaptacao textual sem inventar fatos.
- `ajustes_indisponiveis[].pontos`: lacunas reais que nao podem ser adicionadas sem inventar informacao.

Regras:

- A soma dos tres grupos deve fechar `40`.
- `ajustes_indisponiveis` nao entram em `scoreAtualBase`, `pontosDisponiveisBase`, `scoreAposLiberarBase` ou `scoreAposLiberarInterativo`.
- `ajustes_indisponiveis` servem para fechar o orcamento teorico da secao e explicar lacunas nao recuperaveis pela IA.

### Secao 2 — Competencias Tecnicas (orcamento teorico = 40)

Formula conceitual:

`Total Pontos Secao 2 = sum(keywords.presentes[].pontos) + sum(keywords.ausentes[].pontos)`

Regras:

- A soma deve fechar `40`.
- `keywords.ausentes` nao entram automaticamente em `scoreAposLiberarBase`.
- `keywords.ausentes` so entram em `scoreAposLiberarInterativo` quando selecionadas manualmente pelo usuario.

### Secao 3 — Formatacao e Campos (orcamento pratico = 20)

A IA nao retorna `secoes.formatacao.score`.

Calculo da secao 3 no sistema:

- `penalidadesFormatacao = sum(formato_cv.problemas[].impacto)`
- `penalidadesCamposAusentes = soma das penalidades internas para campos ausentes`
- `totalSecao3Atual = clamp(20 - penalidadesFormatacao - penalidadesCamposAusentes, 0, 20)`
- `melhoriasFormatacaoSecao3 = sum(penalidades recuperaveis por reestruturacao do CV)`
- `camposIndisponiveisSecao3 = sum(penalidades de campos ausentes que exigem informacao real do usuario)`

Regra de recuperabilidade:

- Nem toda perda da secao 3 e recuperavel automaticamente pela IA.
- Penalidades de campos ausentes que dependem de dado factual do candidato (ex.: Telefone, LinkedIn, Formacao academica, Localizacao quando nao informada no historico) devem ser classificadas como `camposIndisponiveisSecao3`.
- Somente penalidades recuperaveis por reorganizacao/reescrita/estrutura entram em `melhoriasFormatacaoSecao3`.
- `camposIndisponiveisSecao3` nao entram em `pontosDisponiveisBase`.

Tabela inicial de penalidades internas para campos ausentes (manter se nao houver tabela mais madura no codigo):

- Campos essenciais: `2` pontos cada
  - Nome completo
  - E-mail
  - Telefone
  - Localizacao
  - Experiencias com datas
  - Formacao academica
- Campos recomendaveis: `1` ponto cada
  - LinkedIn
  - Resumo profissional
  - Habilidades e Competencias

Observacao: se ja existir tabela de penalidade mais madura, manter a existente desde que nao dependa de score da IA e que o total da secao continue limitado a `20`.

### Formulas finais do sistema

- `pontosFortesSecao1 = sum(positivos[].pontos)`
- `ajustesConteudoSecao1 = sum(ajustes_conteudo[].pontos)`
- `ajustesIndisponiveisSecao1 = sum(ajustes_indisponiveis[].pontos)`
- `jaNoCvSecao2 = sum(keywords.presentes[].pontos)`
- `keywordsAusentesTotal = sum(keywords.ausentes[].pontos)`
- `bonusKeywordsSelecionadas = sum(keywords.ausentes selecionadas manualmente pelo usuario)`
- `penalidadesFormatacao = sum(formato_cv.problemas[].impacto)`
- `penalidadesCamposAusentes = soma das penalidades internas dos campos ausentes`
- `totalSecao3Atual = clamp(20 - penalidadesFormatacao - penalidadesCamposAusentes, 0, 20)`
- `melhoriasFormatacaoSecao3 = sum(penalidades recuperaveis por reestruturacao do CV)`
- `camposIndisponiveisSecao3 = sum(penalidades de campos ausentes que exigem informacao real do usuario)`
- `scoreAtualBase = pontosFortesSecao1 + jaNoCvSecao2 + totalSecao3Atual`
- `pontosDisponiveisBase = ajustesConteudoSecao1 + melhoriasFormatacaoSecao3`
- `scoreAposLiberarBase = min(scoreAtualBase + pontosDisponiveisBase, 100)`
- `scoreAposLiberarInterativo = min(scoreAposLiberarBase + bonusKeywordsSelecionadas, 100)`

### Clamp obrigatorio

Todo score exibido na interface deve aplicar clamp de faixa:

- minimo `0`
- maximo `100`

Aplicar em:

- `scoreAtualBase`
- `scoreAposLiberarBase`
- `scoreAposLiberarInterativo`
- qualquer score derivado exibido no frontend

### Nomenclatura

- Nao usar `pontosCamposSecao3`.
- Usar `totalSecao3Atual` quando for pontuacao atual da secao 3.
- Usar `melhoriasFormatacaoSecao3` quando for pontos recuperaveis por melhoria de formatacao/campos.

## Mudancas de implementacao

### 1) `normalize-data.ts`

- Adicionar ao retorno um objeto de derivados de score, por exemplo:
  - `score.scoreAtualBase`
  - `score.pontosDisponiveisBase`
  - `score.scoreAposLiberarBase`
  - `score.totalSecao3Atual`
  - `score.melhoriasFormatacaoSecao3`
- Reutilizar arrays normalizados (`positivos`, `ajustes_conteudo`, `ajustes_indisponiveis`, `keywords.presentes`, `keywords.ausentes`) e `formato_cv` para produzir agregados.
- Nao consumir nenhum campo de score vindo da IA, incluindo `secoes.formatacao.score`.
- Tratar ausencias de arrays/campos com defaults seguros (`[]`, `0`) para manter calculo deterministico.

### 2) `page.tsx`

- Remover dependencia de qualquer score historico vindo de `fit` ou do payload bruto da IA.
- Usar apenas derivados retornados por `normalizeData` como base de score.
- Manter a parte interativa de selecao de keywords ausentes, somando somente `bonusKeywordsSelecionadas` ao `scoreAposLiberarBase`.
- Garantir que keywords ausentes nao sejam somadas automaticamente.
- Aplicar clamp em `[0, 100]` para todos os scores exibidos.
- Ajustar labels auxiliares para refletir a composicao oficial:
  - `Score Atual = pontosFortesSecao1 + jaNoCvSecao2 + totalSecao3Atual`
  - `Pontos disponiveis = ajustesConteudoSecao1 + melhoriasFormatacaoSecao3`
  - `Score apos liberar (interativo) = scoreAposLiberarBase + bonusKeywordsSelecionadas`

### 3) `session-actions.ts`

- Estender retorno de `getAuthStatus` com `internalRole` (`none | admin | superadmin | null` quando deslogado).
- Em caso de erro no carregamento de plano, manter `internalRole` disponivel se houver usuario autenticado.

### 4) Botao admin de download JSON bruto na CTA

- Em `page.tsx`, derivar `isAdminView` a partir de `getAuthStatus().internalRole`.
- Renderizar botao adicional (somente admin/superadmin) na coluna de acoes da CTA final.
- Handler:
  - `JSON.stringify(rawData, null, 2)`
  - criar `Blob` com `application/json;charset=utf-8`
  - disparar download via `URL.createObjectURL`
  - nome do arquivo: `analise-ia-bruta-${reviewAdaptationId ?? "guest"}-${Date.now()}.json`

## Erros e estados

- Se `rawData` indisponivel, botao admin nao aparece (estado de loading ja cobre esse cenario).
- Se serializacao falhar (muito improvavel), reaproveitar `claimError` com mensagem curta de falha no download de JSON.
- Botao admin nao deve bloquear ou alterar fluxo de liberacao/download de PDF/DOCX.

## Testes

### Testes de regra de score (obrigatorios)

1. A spec/implementacao nao depende de nenhum score retornado pela IA.
2. Secao 1 fecha 40 pontos:
   - `sum(positivos[].pontos) + sum(ajustes_conteudo[].pontos) + sum(ajustes_indisponiveis[].pontos) = 40`
3. `ajustes_indisponiveis` nao entram em:
   - `scoreAtualBase`
   - `pontosDisponiveisBase`
   - `scoreAposLiberarBase`
   - `scoreAposLiberarInterativo`
4. Secao 2 fecha 40 pontos:
   - `sum(keywords.presentes[].pontos) + sum(keywords.ausentes[].pontos) = 40`
5. `keywords.ausentes` nao entram automaticamente no `scoreAposLiberarBase`.
6. `keywords.ausentes` so entram no `scoreAposLiberarInterativo` quando selecionadas manualmente pelo usuario.
7. Secao 3 e calculada pelo sistema:
   - `totalSecao3Atual = max(0, 20 - penalidadesFormatacao - penalidadesCamposAusentes)`
8. `scoreAtualBase = pontosFortesSecao1 + jaNoCvSecao2 + totalSecao3Atual`.
9. `pontosDisponiveisBase = ajustesConteudoSecao1 + melhoriasFormatacaoSecao3`.
10. `scoreAposLiberarBase = min(scoreAtualBase + pontosDisponiveisBase, 100)`.
11. `scoreAposLiberarInterativo = min(scoreAposLiberarBase + bonusKeywordsSelecionadas, 100)`.
12. Todos os scores exibidos respeitam minimo `0` e maximo `100`.

### Unitarios `normalize-data`

- Cobrir as formulas oficiais com fixture controlada, incluindo secao 3 via `formato_cv.problemas` + `formato_cv.campos`.
- Cobrir classificacao de perdas da secao 3 entre recuperaveis (`melhoriasFormatacaoSecao3`) e indisponiveis (`camposIndisponiveisSecao3`).
- Cobrir defaults quando campos da IA vierem ausentes/parciais.
- Cobrir clamp defensivo para nao sair de `[0, 100]`.

### Unitarios/integrais de tela (`page.tsx`)

- Validar composicao do score exibido usando base + bonus de keywords selecionadas.
- Validar que keywords ausentes nao alteram score sem selecao manual.
- Validar clamp em `[0, 100]` no score exibido apos interacao.
- Validar exibicao condicional do botao admin por papel.

### Session actions

- Cobrir retorno de `internalRole` em:
  - deslogado
  - logado normal (`none`)
  - logado admin/superadmin

## Trade-offs e decisoes

- Decisao: centralizar formula base em `normalizeData`.
  - Beneficio: regra unica e reaproveitavel, menor risco de divergencia na UI.
  - Custo: retorno do normalizador fica mais rico e exige pequenos ajustes de consumo.
- Decisao: manter `ajustes_indisponiveis` fora de oportunidade recuperavel.
  - Beneficio: preserva a regra de nao inventar fatos e separa claramente lacuna real de melhoria textual.
  - Custo: score apos liberar pode ficar abaixo de 100 em casos de lacuna estrutural real.
- Decisao: usar payload bruto ja presente em memoria (`rawData`) para download admin.
  - Beneficio: evita nova chamada de rede e garante consistencia com o que a tela recebeu.
  - Custo: se no futuro houver necessidade de auditoria de payload de transporte completo, pode ser preciso endpoint dedicado.

## Fora de escopo

- Alteracoes no backend de analise ou no prompt em si.
- Persistencia desse JSON bruto em storage/backend para auditoria historica.
- Alteracoes visuais amplas fora da CTA final.

## Criterios de aceite

1. Tela calcula `Score Atual`, `Pontos disponiveis` e `Score apos liberar` apenas com regras internas, sem score da IA.
2. Selecao de keywords ausentes incrementa somente `scoreAposLiberarInterativo`, com selecao manual explicita.
3. `ajustes_indisponiveis` fecha a secao 1 teorica, mas nao entra em score recuperavel.
4. Secao 3 e calculada no sistema com base em problemas de formatacao e campos ausentes.
5. Todo score exibido aplica clamp de minimo `0` e maximo `100`.
6. Botao de download de JSON bruto aparece apenas para admin/superadmin autenticado na CTA final.
7. Arquivo baixado contem o payload bruto da IA sem normalizacao.
8. Cobertura de testes atualizada para formulas, clamp e condicao de visibilidade admin.

## Resumo das alteracoes aplicadas

- Campos removidos como dependencia da IA: `ATS Score`, `score atual`, `scoreAtual`, `score_atual`, `score apos liberar ajustes`, `scoreAposLiberar`, `score pos otimizacao`, `pontos disponiveis`, `pontosDisponiveis`, `pontos_disponiveis`, `secoes.formatacao.score`, `ats_score`, `score_apos_liberar`.
- Formulas alteradas: secao 1 passa a fechar 40 com `positivos + ajustes_conteudo + ajustes_indisponiveis`; secao 2 fecha 40 com `keywords.presentes + keywords.ausentes`; secao 3 passa a ser calculada por penalidades de formatacao e campos ausentes.
- Novos campos considerados no layout/normalizacao: `ajustes_indisponiveis`, `formato_cv.problemas[].impacto`, `formato_cv.campos[].presente`.
- Testes adicionados/corrigidos: 12 testes obrigatorios cobrindo independencia de score da IA, fechamento das secoes, exclusao de `ajustes_indisponiveis` de score recuperavel, comportamento interativo de `keywords.ausentes`, formulas finais e clamp `[0, 100]`.
- Decisoes importantes mantidas: botao admin para JSON bruto, visibilidade apenas admin/superadmin, download via `rawData` original sem `normalizeData`, nome de arquivo com identificador/timestamp, foco de auditoria/debug da resposta bruta da IA.
