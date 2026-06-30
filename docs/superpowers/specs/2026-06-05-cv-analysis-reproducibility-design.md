# Reprodutibilidade da Análise de CV — Design

- **Data:** 2026-06-05
- **Autor:** Paulo (direção) + assistente (especificação)
- **Status:** Proposta — direção aprovada; não implementar antes do plano (§14)
- **Escopo:** `packages/ai/src/cv-adaptation.ts`, `apps/web/src/app/adaptar/resultado/normalize-data.ts`, `apps/api/src/cv-adaptation/*`, `apps/api/src/analysis-protection/analysis-dedupe-cache.service.ts`
- **Produção com pagantes:** mudança sensível. Exige validação e comparação de qualidade antes de qualquer rollout (ver §9, §10, §14).

---

## 1. Problema

Fazemos uma análise do CV do usuário que retorna um score (~50%) e sugerimos que, ao adaptar o CV pela EarlyCV, ele melhora. Quando o usuário baixa o CV adaptado e o re-analisa, a ferramenta pontua de novo ~50% e sugere outras melhorias.

Isso quebra a credibilidade da metodologia: dá a impressão de que o número é arbitrário.

A causa **não** é apenas "variação natural do LLM". É um conjunto de problemas estruturais que tornam o número **não reprodutível**.

---

## 2. Diagnóstico do fluxo atual

### 2.1. Chamadas de LLM independentes e desconectadas

| # | Função | Prompt | Quando | Produz |
|---|--------|--------|--------|--------|
| 1 | `analyzeAndAdaptCv` | `ANALYSIS_SYSTEM_PROMPT` | pré-pagamento (preview/freemium) | pontos por item da análise |
| 2 | `adaptCv` | `SYSTEM_PROMPT` | pós-pagamento (geração do CV) | seções do CV adaptado |
| 3 | `analyzeAndAdaptCv` (de novo) | `ANALYSIS_SYSTEM_PROMPT` | quando o usuário re-analisa o CV baixado | pontos por item, do zero |

As três não compartilham estado. A #2 (geração) **nem recebe** a lista `ajustes_conteudo` da #1. A #3 reavalia do zero.

### 2.2. O score nunca é "medido" — é montado no front

`apps/web/src/app/adaptar/resultado/normalize-data.ts` calcula a nota a partir dos pontos que o LLM distribuiu:

- `scoreAtualBase` (o "50% agora") = `Σ positivos` + `Σ keywords.presentes` + `formatação (20 − penalidades)`.
- `scoreAposLiberarBase` (o "75% se baixar") = `scoreAtualBase + Σ ajustes_conteudo[].pontos`.

Ou seja, o **"depois" é uma projeção otimista**: assume que a adaptação captura 100% dos `ajustes_conteudo`. Nada verifica isso. O CV gerado pela #2 pode não atacar exatamente essas lacunas.

### 2.3. A chamada é estocástica

Em `packages/ai/src/cv-adaptation.ts`, `temperature` está **comentada** (linhas ~1002 e ~1066) → usa o default do provider (~1.0). Sem `seed`, sem rubrica numérica fixa. Cada rodada redistribui pontos de forma diferente.

### 2.4. O orçamento por seção é correto; o problema é a atribuição estocástica dos pontos

O modelo de orçamento está correto e deve permanecer: cada seção tem um **teto** — Experiência 40, Competências 40, Formatação 20 — totalizando **no máximo 100**. Um CV excelente pode legitimamente ter `positivos = 40` na Seção 1 (sem lacunas); o orçamento **não força** a existência de lacunas.

O problema é **quem distribui os pontos dentro de cada teto**: hoje é julgamento subjetivo do LLM. Em cada rodada o modelo realoca diferente entre `positivos` / `ajustes_conteudo` / `ajustes_indisponiveis` (Seção 1) e `presentes` / `ausentes` (Seção 2). Combinado com §2.2 e §2.3, a re-análise redistribui o orçamento de forma diferente, "redescobre" ajustes e o score atual não reproduz a projeção anterior. A correção é manter o orçamento e tornar a **atribuição** dos pontos determinística (§5).

### 2.5. O cache existente não resolve

`AnalysisDedupeCacheService` já tem hash de conteúdo (`buildCanonicalHash`) e `get/setCachedResult`, mas:

- É escopado por usuário/sessão/IP (`resolveScope`) — não global.
- TTL de 5 min (`cacheTtlMs = 300_000`).
- O CV baixado tem texto diferente do original → hash diferente → nunca bate.

É um cache anti-abuso/dedupe, não de reprodutibilidade.

---

## 3. Objetivo e decisões

A nota deve ser uma **função quase-determinística** de `(conteúdo relevante do CV, descrição da vaga, rubricVersion)`:

- Mesma entrada → mesma nota, dentro de uma **banda aceitável**.
- O `scoreDepois` deve ser **medido no CV efetivamente adaptado** — e o CV adaptado só é gerado **após o pagamento** (§6).
- Re-analisar o CV baixado deve reproduzir o `scoreDepois` medido (dentro da banda).
- A qualidade humana do conteúdo gerado **não pode regredir**.

### 3.1. Decisões fechadas (Paulo, 2026-06-05)

- **A chamada B (geração do CV adaptado) continua PÓS-PAGAMENTO.** Não gerar o CV adaptado completo na análise gratuita — aumentaria custo com quem não converte e criaria risco de vazamento do conteúdo completo. O objetivo da reprodutibilidade **não** é gerar o CV antes do pagamento; é garantir que a geração, quando acontecer depois, esteja **fortemente linkada** à análise feita antes.
- **Vínculo por plano estruturado persistido**, não por execução antecipada do prompt de geração. A análise gratuita salva um **plano de adaptação** (lacunas, evidências, recomendações, `JobRequirementSet`) que orienta a geração paga.
- **Promessa medida de verdade:** `scoreDepois` só existe após a geração paga. Antes do pagamento, comunicação comercial usa **estimativa conservadora ou linguagem qualitativa** — nunca um número como se já tivesse sido medido (§8).
- **Determinismo concentrado no scorer e na chamada A (diagnóstico)**, não na geração. A é `temperature: 0` + seed e **não calcula score**; o score é exclusivamente do scorer determinístico em código. B preserva o tom humano (sem determinismo absoluto).
- **`JobRequirementSet` separado de `CvEvaluation`** (§5.0): a régua da vaga é estável para qualquer candidato; cache por `hash(vaga + rubricVersion)`.
- **Score da Experiência composto** (embeddings = 40% + cobertura + senioridade + impacto), não só similaridade textual (§5.3).
- **Matching robusto**: aliases/sinônimos, negações e menção-vs-evidência (§5.1).
- **Cache + invalidação semântica** preservando presença/ausência de campos (§6.6).
- **Preenchimento de campos faltantes sem IA** na análise gratuita (§6.5).
- **Gating/segurança simplificados**: o CV adaptado completo não existe antes do pagamento; ainda assim, validar que o payload gratuito traz só diagnóstico/recomendações/lacunas (§6.8).

---

## 4. Princípio central

> **O determinismo do *scorer* é a garantia primária. O cache é otimização.**

O PDF/DOCX baixado, quando re-enviado e parseado, **não** volta byte a byte igual ao JSON adaptado (ruído de extração). Um cache por hash exato é frágil para a re-análise. A reprodutibilidade real vem de um scorer que, dado texto quase-idêntico, produz nota quase-idêntica. O cache acelera e trava o caso "mesma entrada exata".

---

## 5. Scoring determinístico

Score total = Experiência (40) + Competências (40) + Formatação (20). O LLM **nunca** calcula nem retorna o score — só o scorer em código.

### 5.0. Dois artefatos: `JobRequirementSet` e `CvEvaluation`

A régua da vaga deve ser **estável para qualquer candidato**. Por isso a extração dos requisitos é separada da avaliação do CV:

- **`JobRequirementSet`**
  - Input: descrição da vaga + `rubricVersion`.
  - Output: requisitos, competências, senioridade, pesos, keywords e critérios extraídos **só da vaga**.
  - Produzido por LLM (`temperature: 0` + `seed`), **cacheável por `hash(vaga + rubricVersion)`** — independente do CV.
  - **Persistido e referenciável por ID/hash** junto da análise, para auditar quais requisitos, pesos e aliases entraram no cálculo (§11.1).

- **`CvEvaluation`**
  - Input: CV + `JobRequirementSet` + `rubricVersion`.
  - Output: `scoreAntes`, lacunas (corrigíveis e indisponíveis), evidências e justificativas.
  - O score é **determinístico** (código, §5.1–5.3); insumos qualitativos vêm da chamada A (§6.1).

> Correção vs. versão anterior: cache da régua **não** pode ser por `hash(vaga + CV)` — isso acoplaria a régua da vaga ao CV. É `hash(vaga + rubricVersion)`.

#### 5.0.1. Validação mínima do `JobRequirementSet`

Antes de usar a régua no cálculo, validar:

- número mínimo de requisitos;
- separação explícita entre **must-have** e **nice-to-have**;
- pesos válidos (dentro da faixa esperada);
- nenhum requisito que não apareça nem seja inferível da vaga.

Se inválido: **refazer a extração uma vez**; persistindo a falha, cair para fluxo legado/controlado (sem quebrar o usuário).

### 5.1. Competências (40) — determinístico por matching

1. **Requisitos/keywords** vêm do `JobRequirementSet`, cada um com peso por criticidade (ex.: must-have = 3, nice-to-have = 1).
2. **Matching contra o CV** (100% código):
   - **Aliases/sinônimos** via dicionário versionado (`aliasVersion`, ver §11.1). Exemplos:
     ```txt
     Power BI         = ["power bi", "powerbi", "microsoft power bi"]
     Machine Learning = ["machine learning", "ml", "modelos preditivos", "aprendizado de máquina"]
     SQL              = ["sql", "t-sql", "postgresql", "mysql", "sql server"]
     ```
   - **Negações** não contam como evidência: `"não tenho experiência com Python"` ≠ Python presente. Detectar negação na vizinhança do termo.
   - Normalização: lowercase, sem acento, word-boundary.
3. **Menção simples vs. evidência contextual** — pesos diferentes:
   ```txt
   menção simples (só na lista de skills):                 peso parcial
   evidência em experiência/projeto (uso real descrito):   peso cheio
   ```
4. `scoreComp = round( Σ peso_efetivo(presentes) / Σ peso(todas) × 40 )`.

### 5.2. Formatação (20) — 100% código

- Campos (nome, e-mail, telefone, LinkedIn, localização, resumo, formação, experiências com datas, habilidades) detectados por regex/parse.
- Penalidades por problema (multi-coluna, tabelas, ausência de datas etc.) com pesos fixos.
- Sem LLM. `scoreFmt = clamp(20 − penalidades, 0, 20)`.

### 5.3. Experiência (40) — score composto (não só embeddings)

Embeddings sozinhos são insuficientes: proximidade textual não é evidência. Score composto:

```txt
scoreExperiencia (0–40) =
  40% similaridade semântica geral (embeddings: experiência × JobRequirementSet)
  30% cobertura de requisitos críticos dentro das experiências (matching §5.1)
  20% evidência de senioridade/responsabilidade
  10% evidência de impacto/resultados
```

Avaliação por **evidência equivalente**, não literal. Ex.: "liderança de times de dados" é satisfeito por `liderou time de BI · gerenciou equipe de ciência de dados · coordenou squad de analytics · estruturou área de dados` (equivalentes no dicionário de aliases).

- Custo: uma chamada de embedding (barata), cacheável.
- Pesos 40/30/20/10 e thresholds **calibrados no golden set** (§10) e versionados pela `rubricVersion`.

### 5.4. O que muda no contrato do LLM

- O LLM (chamada A) **não distribui pontos** nem retorna score. O orçamento 40/40/20 permanece, mas a alocação entre `positivos` / `ajustes_conteudo` / `ajustes_indisponiveis` e `presentes` / `ausentes` é **derivada pelo scorer em código** e distribuída para a UI.
- Remover a "REGRA DE CALIBRAÇÃO DE PONTOS" (atribuição/soma de pontos pelo LLM), mantendo o conceito de seções/tetos.

### 5.5. Banda aceitável

Tolerância de reprodutibilidade, ex.: **±3 pontos** sobre o mesmo conteúdo relevante. Vira critério de aceite (§11) e teste (§10).

### 5.6. Implementação do scorer em etapas

Quebrar em incrementos testáveis, nesta ordem: (a) **Formatação**; (b) **Competências**; (c) **Experiência composta**; (d) **integração do total 40/40/20**.

---

## 6. Fluxo: análise gratuita → geração paga

### 6.1. Antes do pagamento — análise gratuita (Chamada A: diagnóstico estruturado)

No fluxo gratuito:

1. Extrair/normalizar o conteúdo do CV e da vaga.
2. Gerar o `JobRequirementSet` (§5.0).
3. **Chamada A — Diagnóstico estruturado** (LLM, `temperature: 0` + seed): identifica **lacunas** (corrigíveis e indisponíveis), **competências detectadas**, **campos ausentes**, **evidências**, **oportunidades de melhoria** e **insumos qualitativos** (headline, dicas, preview). **Não calcula nem retorna score** e **não gera o CV adaptado**.
4. **Calcular `scoreAntes`** com o scorer determinístico (§5) sobre o CV original.
5. Exibir análise, lacunas e recomendações; salvar o **plano estruturado de adaptação** (§6.3).

**Não** fazer no gratuito: gerar o CV adaptado completo; gerar bullets reescritos completos; retornar JSON completo de CV adaptado no payload.

### 6.2. Após pagamento/liberação de crédito — geração paga (Chamada B)

Executar a **Chamada B** (prompt de geração), recebendo como input:

- CV original estruturado;
- descrição da vaga;
- `JobRequirementSet` (mesmo da análise original);
- diagnóstico/lacunas e recomendações estruturadas (o plano de §6.3);
- `rubricVersion` e `aliasVersion` (os da análise original);
- restrições anti-alucinação.

B gera o **CV adaptado completo em JSON** e o resultado é salvo e associado à análise original. B **não** força determinismo absoluto — reaproveita o `SYSTEM_PROMPT` atual + bloco "corrija estes pontos", priorizando qualidade textual, naturalidade e fidelidade factual.

### 6.3. Vínculo análise ↔ geração (plano estruturado)

- A geração B **não reanalisa do zero** a vaga e o CV: usa os insumos da análise como **plano de adaptação**.
- Isso garante consistência entre o diagnóstico gratuito e o CV gerado após o pagamento.
- B pode melhorar redação, organização e priorização, mas **não inventa** experiências, competências ou resultados ausentes no CV/perfil original.

Fluxo recomendado:

```txt
Análise gratuita:
vaga + CV original
→ extrair/normalizar conteúdo
→ gerar JobRequirementSet
→ Chamada A (diagnóstico estruturado, sem score)
→ calcular scoreAntes (scorer determinístico)
→ exibir análise, lacunas e recomendações
→ salvar plano estruturado de adaptação

Pagamento/liberação de crédito:
→ carregar análise original + plano estruturado
→ Chamada B (geração do CV adaptado) usando o plano
→ salvar JSON adaptado
→ calcular scoreDepois (scorer determinístico sobre o JSON adaptado)
→ disponibilizar CV adaptado para download
```

### 6.4. Medição de score e persistência

- `scoreAntes`: medido na análise gratuita sobre o CV original.
- `scoreDepois`: **só calculado após a geração paga**, rodando o scorer determinístico sobre o JSON adaptado. Antes disso ele **não existe**.
- Persistir: `scoreAntes`, `scoreDepois`, `delta`, `rubricVersion`, `aliasVersion`, `JobRequirementSetId`/hash e referência ao CV adaptado gerado.

### 6.5. Preenchimento de campos faltantes pelo usuário (sem IA)

Quando a análise gratuita aponta um campo essencial ausente (ex.: LinkedIn, localização, telefone), a tela **abre um input** para o usuário preencher na hora.

- A detecção vem do scorer/Formatação (§5.2) e do diagnóstico A — **não** depende de gerar o CV adaptado.
- Ao preencher, o **sistema mescla o valor nos dados estruturados do CV sem chamar IA**.
- O **scorer recalcula `scoreAntes`** na hora (ex.: preencher LinkedIn sobe a Formatação) → feedback imediato e honesto.
- O valor preenchido é **persistido no plano estruturado** e fica disponível para a Chamada B usar na geração paga.
- Invariante: o sistema só insere o que o **usuário** digitou (dado real). Nunca inventa valor.

### 6.6. Hash semântico e "conteúdo relevante normalizado"

O cache de reprodutibilidade é keyed por `hash(conteúdo relevante normalizado + vaga + rubricVersion + aliasVersion)`.

**Conteúdo relevante normalizado:**

- **Inclui:** resumo, experiências, cargos, empresas, datas, formação, competências, certificações, idiomas e **presença/ausência** dos campos de contato.
- **Ignora/normaliza:** nome; **valor literal** de e-mail, telefone e URL do LinkedIn; espaços, quebras de linha, acentos, caixa e pontuação não estrutural.

Distinguir **valor** de **sinal estrutural**:

```txt
email:    PRESENT
phone:    PRESENT
linkedin: MISSING
location: PRESENT
```

Assim, trocar o valor do e-mail → cache hit; preencher o LinkedIn (MISSING → PRESENT) ou mudar experiência/resumo → invalida e recalcula.

### 6.7. Reprodutibilidade na re-análise e custo de IA

- **Garantia primária:** o scorer é determinístico → o mesmo conteúdo relevante produz a mesma nota (dentro da banda), mesmo sem cache.
- **CV gerado pela EarlyCV** (com JSON/score salvos ou cache de reprodutibilidade): re-análise = **0 IA** (usa o resultado persistido/cacheado).
- **Entrada realmente nova** (CV/vaga nunca vistos): a Chamada A ainda pode ser necessária para o diagnóstico qualitativo, e o `JobRequirementSet` para vaga nova; **o score continua determinístico**. O `JobRequirementSet` cacheado por vaga evita recomputar a régua para vagas repetidas.

### 6.8. Gating e segurança (simplificado, testável)

Como o CV adaptado completo **só existe após o pagamento**, o gating fica mais simples — mas ainda exige garantias:

- A análise gratuita **não** retorna conteúdo que equivalha ao CV adaptado completo.
- O payload pré-pagamento contém **apenas** diagnóstico, recomendações e lacunas — **nunca** uma versão reescrita completa do currículo.

**Critérios de aceite de segurança (testáveis):**

- Nenhum endpoint pré-pagamento retorna o JSON completo do CV adaptado (ele ainda não existe).
- Nenhum payload pré-pagamento contém bullets reescritos completos, experiências reescritas completas ou seções completas do CV adaptado.
- Testes automatizados validam que o preview/diagnóstico público não inclui versão reescrita completa.
- Logs e respostas de erro não expõem o CV (usar `correlationId`, §6.9).

### 6.9. Fallback se a Chamada B falhar (pós-pagamento)

- Manter a análise A e o `scoreAntes` disponíveis.
- **Não** exibir `scoreDepois` medido (não existe).
- Permitir **retry server-side** da geração.
- **Não** consumir crédito / não cobrar por geração incompleta.
- Registrar o erro com `correlationId`, **sem expor o CV nos logs**.

---

## 7. Por que separar (e não fundir) os prompts

Fundir análise + geração num único prompt tem **risco real de degradar a geração**:

- **Objetivos opostos**: análise quer ser crítica/estruturada; geração quer ser fluente/humana. Uma completion alterna entre "crítico" e "redator" e dilui as duas.
- **JSON enorme** (CV completo + análise) → truncamento, erro de JSON, queda de atenção no texto humano.
- **Dois system prompts grandes** com regras concorrentes → o modelo mistura/derruba regras.

**Decisão:** manter **dois prompts separados**, executados em **momentos diferentes** (A gratuito, B pós-pagamento), **linkados por dados estruturados** (§6.3). Não roda B sem pagamento.

**Contagem de chamadas LLM "pesadas":**

- **Hoje** (converte e re-analisa): análise (1) + geração (1) + re-análise (1) = **~3**.
- **Proposto**: gratuito = `JobRequirementSet` (1, cacheável por vaga) + Chamada A (1); pago = Chamada B (1); re-análise de CV da EarlyCV = **0**. Embeddings à parte (baratos, cacheáveis).
- Opção de custo: `JobRequirementSet` e diagnóstico A **podem** sair de uma única chamada que emite as duas partes (persistidas como artefatos separados), se a medição de custo indicar.

Resultado: resolve a reprodutibilidade mantendo o uso de IA na mesma ordem do fluxo atual, **sem** gerar CV pré-pagamento.

---

## 8. Impacto de produto / UX

- **Pré-pagamento não promete número medido.** Exibir `scoreAntes` real + diagnóstico/recomendações. Para o "depois", usar **estimativa conservadora ou linguagem qualitativa** ("tende a melhorar a aderência reorganizando X e cobrindo Y"), nunca "seu CV terá Z%".
- **`scoreDepois` real** aparece **após** a geração paga, medido sobre o CV adaptado.
- O "antes/depois" passa a ser reprodutível: mesmo CV+vaga sempre mostra os mesmos números (dentro da banda).
- Inputs inline para campos faltantes (§6.5), com `scoreAntes` subindo em tempo real.

### 8.1. `scoreRaw` vs. `scoreDisplay` — evitar falsa precisão

```txt
scoreRaw     = 73.42   (interno, usado em cálculo/golden set)
scoreDisplay = 73      (inteiro exibido)
```

Considerar exibição **por faixas**:

```txt
0–49:  baixo alinhamento
50–69: médio alinhamento
70–84: alto alinhamento
85+:   muito alto alinhamento
```

### 8.2. Quando `scoreDepois <= scoreAntes`

- **Não** exibir promessa agressiva de melhora numérica.
- Mensagem neutra, ex.: *"CV reorganizado para melhor aderência, mas sem ganho relevante de pontuação nesta vaga."*
- **Registrar** o caso (sinal de qualidade) e alimentar o golden set.
- Meta (golden set, §10): em **80–90%** dos casos `scoreDepois >= scoreAntes`; **nenhum** caso com queda > 3 pontos sem justificativa técnica.

---

## 9. Preservação da qualidade do conteúdo (gate)

O `SYSTEM_PROMPT` de geração (`adaptCv`) está bom hoje. A Chamada B (§6.2) **reaproveita** esse prompt + um bloco com os pontos a corrigir (plano de A). Riscos a vigiar: (a) a correção degradar o tom humano; (b) B inventar fatos para "fechar" uma lacuna. Gate obrigatório antes do rollout:

1. Montar **conjunto de CVs + vagas de referência** (10–20 pares cobrindo dados, produto, BI, backend, etc.).
2. Gerar o CV adaptado com o fluxo **atual** (baseline) e com o **fluxo proposto** (A→plano→B).
3. Comparar lado a lado: fidelidade aos fatos (invariante "nunca inventar" — atenção redobrada por B receber instruções de correção), cobertura de keywords, legibilidade, ausência de seções vazias, tom humano.
4. Critério: **nenhuma regressão perceptível** vs. baseline e **nenhum fato inventado**. Se houver, ajustar o prompt de B antes de seguir.

---

## 10. Calibração e testes

### 10.1. Golden set valida COMPORTAMENTO, não só a nota

Para cada caso, fixar expectativas estruturais:

- skills que **devem** ser detectadas;
- skills que **não devem** ser detectadas (anti-falso-positivo);
- campos ausentes esperados;
- lacunas corrigíveis e não corrigíveis esperadas;
- faixa de `scoreAntes` e de `scoreDepois`;
- delta mínimo esperado;
- justificativas esperadas em alto nível.

```json
{
  "caseId": "data-manager-001",
  "expected": {
    "mustDetectSkills": ["SQL", "Power BI", "liderança de equipe"],
    "mustNotDetectSkills": ["Kubernetes"],
    "missingFields": ["linkedin"],
    "scoreBeforeRange": [48, 54],
    "scoreAfterRange": [70, 78],
    "minDelta": 15
  }
}
```

### 10.2. Demais testes

- **Reprodutibilidade:** scorer 2× sobre o mesmo conteúdo → diferença ≤ banda (§5.5).
- **Round-trip:** gerar adaptado → renderizar PDF/DOCX → re-extrair → re-pontuar → cai na banda do `scoreDepois` medido (§4).
- **Invalidação semântica (§6.6):** trocar valor de contato → mesmo hash; adicionar/remover campo ou mudar experiência → hash diferente.
- **Negações e aliases (§5.1).**
- **`JobRequirementSet` (§5.0.1):** validação mínima e refazer-uma-vez.
- **`scoreDepois <= scoreAntes` (§8.2):** ≥ 80–90% com `depois >= antes`; nenhum com queda > 3 pts sem justificativa.
- **Fallback de B (§6.9):** falha não cobra crédito, não vaza CV, permite retry.
- **Calibração da Experiência (§5.3):** ajustar pesos/thresholds contra julgamento humano.

---

## 11. Critérios de aceite

1. Mesmo CV + mesma vaga, re-analisados, produzem score dentro de ±3 pontos.
2. Trocar o **valor** de um dado de contato não muda o score; **adicionar/remover** campo relevante pode mudar (§6.6).
3. Re-analisar o CV baixado reproduz o `scoreDepois` medido dentro da banda.
4. A atribuição de pontos deixa de ser estocástica (determinística); orçamento 40/40/20 mantido; LLM não retorna score.
5. Qualidade do conteúdo gerado sem regressão e sem fatos inventados (§9).
6. **Chamada B não roda antes do pagamento.**
7. **`scoreDepois` real só existe após a geração paga** (§6.4).
8. A análise gratuita salva insumos suficientes para orientar a geração futura (§6.3).
9. A geração paga usa o **mesmo `JobRequirementSet` e a mesma `rubricVersion`/`aliasVersion`** da análise original. Se a rubrica mudar entre análise e pagamento, usar a versão **associada à análise original** ou criar **explicitamente** uma nova análise — nunca misturar versões silenciosamente.
10. Segurança: nenhum endpoint/payload/log pré-pagamento expõe versão reescrita completa do CV (§6.8).
11. Golden set valida comportamento, não só a nota (§10.1); cobertura de §10.2.
12. Caso `scoreDepois <= scoreAntes` tratado com mensagem neutra (§8.2).
13. `rubricVersion`/`aliasVersion` persistidas em todos os objetos relevantes (§11.1).

### 11.1. Persistir versões em todo objeto relevante

Gravar `rubricVersion` (e `aliasVersion`) em: análise, `scoreAntes`, `scoreDepois`, `JobRequirementSet`, plano estruturado, JSON do CV adaptado, chaves de cache, resultados do golden set e metadados de PDF/DOCX. Qualquer comparação entre scores só vale dentro da mesma versão.

**`rubricVersion` vs. `aliasVersion`:** na v1, `aliasVersion` **acompanha** `rubricVersion`. Registrar que o versionamento pode ser **separado** se o dicionário de aliases evoluir mais rápido que a rubrica de scoring.

### 11.2. Retrocompatibilidade de análises antigas

- Análises legadas **continuam exibindo o score salvo** (não recalcular o histórico automaticamente).
- Se o usuário clicar em **reanalisar**, criar uma **nova** análise com a rubrica atual (não sobrescrever a antiga).
- A UI pode indicar *"metodologia atualizada"* quando o score vier de rubrica anterior.
- Precedente: `2026-06-02-meu-perfil-score-retrocompat-design.md`.

---

## 12. Componentes a alterar (mapa — não implementar ainda)

| Área | Arquivo | Mudança |
|------|---------|---------|
| `JobRequirementSet` | `packages/ai/src/cv-adaptation.ts` (nova função) | extrair requisitos/competências/senioridade/pesos/keywords **só da vaga**; `temperature: 0` + seed; validação mínima (§5.0.1); cacheável e persistido por `hash(vaga + rubricVersion)` |
| Chamada A — Diagnóstico estruturado | `packages/ai/src/cv-adaptation.ts` | recebe `JobRequirementSet`; retorna lacunas + campos ausentes + evidências + insumos qualitativos; **não** calcula/retorna score; `temperature: 0` + seed |
| Scorer determinístico | novo módulo `packages/ai/cv-score.ts` | rubrica versionada; etapas Formatação → Competências → Experiência composta → total (§5.6); roda sobre CV original (`scoreAntes`) e JSON adaptado (`scoreDepois`) |
| Dicionário de aliases | novo recurso versionado (`aliasVersion`) | sinônimos/equivalentes de competências (§5.1) |
| Plano estruturado de adaptação | `apps/api/.../cv-adaptation-*` | persistir diagnóstico/lacunas/recomendações + `JobRequirementSet` ref + versões, para orientar B depois |
| Chamada B — Geração dirigida | `packages/ai/src/cv-adaptation.ts` (`adaptCv`) | **pós-pagamento**; recebe o plano estruturado + `JobRequirementSet` + versões; gera CV completo em JSON; reaproveita `SYSTEM_PROMPT` + bloco de correção; **sem** determinismo absoluto; fallback §6.9 |
| Medição/persistência de score | `apps/api/.../cv-adaptation-ai.service.ts` | `scoreAntes` no gratuito; `scoreDepois` só pós-geração; persistir antes/depois/delta/versões/refs (§6.4) |
| Score no front | `apps/web/.../resultado/normalize-data.ts` | consumir score determinístico da API; parar de "montar" a nota a partir de pontos do LLM; `scoreRaw`/`scoreDisplay` (§8.1) |
| Preenchimento de campos | front + `apps/api/.../cv-adaptation-*` | inputs inline (§6.5); merge sem IA nos dados estruturados; recálculo de `scoreAntes`; persistir no plano |
| Cache de reprodutibilidade | `apps/api/.../analysis-dedupe-cache.service.ts` (ou novo serviço) | cache global persistente por `hash(conteúdo relevante + vaga + rubricVersion + aliasVersion)` (separado do dedupe anti-abuso) |
| Hash semântico | novo util | "conteúdo relevante normalizado" (§6.6): normalizar valores, preservar presença/ausência |

---

## 13. Riscos e questões abertas

- **LLM em `JobRequirementSet`, A e B** → variância residual no conteúdo. Mitigado por `temperature: 0` + seed em extração/diagnóstico, caches por vaga e por conteúdo, e versões fixas. Seed não é garantia absoluta entre versões do provider → fixar `OPENAI_MODEL`, `rubricVersion`, `aliasVersion`. O score é determinístico (código).
- **B com instruções de correção pode inventar fatos** → reforçar invariante "nunca inventar"; gate §9 valida fidelidade.
- **Embeddings** adicionam dependência/custo (são 40% do score de Experiência) → avaliar modelo e custo.
- **Round-trip PDF→texto** pode degradar matching → golden set de round-trip (§10.2).
- **Custo da análise gratuita** sobe levemente (`JobRequirementSet` + A) vs. hoje (1 chamada) → mitigado por cache de `JobRequirementSet` por vaga e pela opção de combinar extração+diagnóstico numa chamada (§7).
- **Pendência:** definir o **limite máximo de custo médio por análise** como gate de rollout (§14).
- **Mudança de rubrica entre análise e pagamento** → critério 9 (§11) resolve: usar a versão da análise ou criar nova análise.

---

## 14. Ordem de implementação e rollout

**Princípio:** começar pelo `JobRequirementSet` e pelo **scorer determinístico isolado** + **golden set**, validando contra o score legado, **antes** de tocar geração, gating ou pagamento. **Não** começar pela refatoração do fluxo comercial. **Não** ativar mudanças para 100% do tráfego antes de validar custo, segurança, latência e qualidade por feature flag.

### 14.1. Ordem recomendada

1. Implementar `JobRequirementSet` (extração + validação mínima + cache).
2. Implementar o **scorer determinístico do CV original** (`scoreAntes`), em etapas (§5.6).
3. Criar o **golden set inicial** (§10.1) e comparar score **legado** vs. **novo**; validar estabilidade/banda (§5.5).
4. Persistir o **plano estruturado de adaptação** na análise gratuita (Chamada A diagnóstico + lacunas + recomendações + refs/versões).
5. **Só então** integrar a **Chamada B pós-pagamento** usando o plano estruturado (§6.2–6.3) + fallback (§6.9).
6. **Só então** calcular `scoreDepois` real sobre o CV adaptado gerado (§6.4).
7. **Por último**, ajustar a UI para comunicar antes/depois corretamente, **sem prometer score futuro não medido** (§8).

### 14.2. Rollout por fases (feature flag)

- **Fase 1:** `JobRequirementSet` + scorer determinístico + golden set; comparar com legado em fluxo controlado / feature flag.
- **Fase 2:** ativar o fluxo novo (plano estruturado + B linkada + `scoreDepois` medido) em **percentual limitado**, medindo gates objetivos:
  - custo médio por análise dentro do **limite definido** (pendência §13);
  - conversão **não piora**;
  - latência aceitável;
  - **nenhum vazamento** de conteúdo reescrito completo (§6.8);
  - qualidade da Chamada B **aprovada no gate** (§9).
- **Fase 3:** ampliar tráfego e ajustar comunicação de score na UI.

### 14.3. Em aberto para a implementação

Calibração da Experiência e thresholds (§10); banda final (§5.5); limite de custo por análise (§13); se `aliasVersion` será separada de `rubricVersion` já na v1 (§11.1); validação do gate de qualidade da Chamada B (§9).

**Próximo passo:** gerar o plano de implementação em `docs/superpowers/plans/2026-06-05-cv-analysis-reproducibility-implementation.md`, seguindo a ordem de §14.1.
