# CV Analysis Reproducibility — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-05-cv-analysis-reproducibility-design.md` (ler antes de começar).

**Goal:** Tornar a nota da análise reprodutível por um **scorer determinístico em código**, separar `JobRequirementSet` da avaliação do CV, e linkar a geração paga (Chamada B) à análise gratuita por um **plano estruturado persistido** — sem gerar o CV adaptado antes do pagamento.

**Architecture:** Extração de requisitos da vaga (`JobRequirementSet`, LLM determinístico, cacheável por vaga) + diagnóstico estruturado (Chamada A, LLM, sem score) na análise gratuita; `scoreAntes` calculado por scorer determinístico; plano de adaptação persistido; após pagamento, Chamada B gera o CV adaptado usando o plano; `scoreDepois` medido sobre o JSON adaptado. Cache de reprodutibilidade global por hash semântico.

**Invariantes (não violar):**
- nunca inventar experiência (B); Chamada B só roda pós-pagamento; LLM nunca calcula score;
- payload pré-pagamento não contém CV reescrito completo; comparação de score só dentro da mesma `rubricVersion`/`aliasVersion`;
- **logs, erros e métricas nunca contêm CV completo, vaga completa ou JSON adaptado completo** — usar apenas IDs, hashes, `correlationId` e metadados não sensíveis;
- o scorer roda sobre uma estrutura canônica única (`CanonicalCvProfile`): tanto o CV original parseado quanto o JSON adaptado são normalizados para esse formato antes do scoring (Task 3).

**Tech Stack:** NestJS, Prisma, TypeScript, Node test runner, OpenAI via `@earlycv/ai`, embeddings, feature flags.

**Ordem (spec §14.1):** `JobRequirementSet` → scorer determinístico → golden set → plano estruturado → Chamada B pós-pagamento → `scoreDepois` → UI. **Não** começar pela refatoração comercial; **não** mexer em gating/pagamento no começo; **não** ativar para 100% do tráfego antes da validação por feature flag.

---

### Task 1: Schema — versionamento, scores, plano e cache de `JobRequirementSet`

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/<timestamp>_add_cv_analysis_reproducibility/migration.sql`
- Modify: `packages/database/src/schema.spec.ts`
- Modify: `apps/api/.railway-redeploy` (via `npm run railway:touch-api`)

- [ ] **Step 1: Failing schema tests**

Em `schema.spec.ts`, asserções para:
- `CvAdaptation` novos campos: `rubricVersion String?`, `aliasVersion String?`, `scoreBeforeRaw Float?`, `scoreAfterRaw Float?`, `scoreDelta Float?`, `adaptationPlanJson Json?`, `jobRequirementSetHash String?`, `jobRequirementSetId String?` (FK opcional → `JobRequirementSet`, mantendo o hash para auditoria), `embeddingModel String?` (metadata anti-drift, Task 5).
- novo model `JobRequirementSet` (cache global): `id`, `jobHash`, `rubricVersion`, `aliasVersion`, `requirementsJson`, `createdAt`. **Unicidade considerando versão:** `@@unique([jobHash, rubricVersion, aliasVersion])` (preferencial); se `aliasVersion` não for separado na v1, `@@unique([jobHash, rubricVersion])`. **Não** usar `jobHash @unique`.
- novo model `CvEvaluationCache` (cache global de avaliação, ponto 8): `id`, `semanticHash`, `jobHash`, `rubricVersion`, `aliasVersion`, `embeddingModel`, `scoreJson`, `createdAt`, `@@unique([semanticHash, jobHash, rubricVersion, aliasVersion])`.

- [ ] **Step 2: Run tests, confirm FAIL**

Run: `npm run test --workspace @earlycv/database -- src/schema.spec.ts` → FAIL.

- [ ] **Step 3: Implement schema + migration**

Adicionar campos/models + FK `CvAdaptation.jobRequirementSetId → JobRequirementSet`. Score persistido como `Raw` (Float); `scoreDisplay` é derivado em runtime (não persistir).

- [ ] **Step 4: Touch railway + regenerate + tests**

Run: `npm run railway:touch-api` (grava `.railway-redeploy` — commitar junto).
Run: `npm run generate --workspace @earlycv/database && npm run test --workspace @earlycv/database -- src/schema.spec.ts` → PASS.

---

### Task 2: `JobRequirementSet` — extração da vaga (LLM determinístico) + validação

**Files:**
- Create: `packages/ai/src/job-requirement-set.ts`
- Create: `packages/ai/src/job-requirement-set.spec.ts`
- Modify: `packages/ai/src/index.ts`

- [ ] **Step 1: Failing tests para o contrato de saída**

Testar: extrai `requirements[]` com `{ term, weight, criticality: "must"|"nice", sourceEvidence, confidence }`, `seniority`, `keywords`; `temperature: 0` + `seed` no request; refazer extração uma vez se inválido; em segunda falha, sinalizar `invalid` (sem throw que quebre o fluxo).

Validação mínima (§5.0.1) — **baseada em regras testáveis, não em julgamento mágico**:
- nº mínimo de requisitos; must/nice presentes; pesos válidos;
- **"não inferível da vaga" = ausência de `sourceEvidence`**: cada requisito deve trazer trecho/evidência textual da vaga (ou marcação de inferência por regra mínima conhecida); requisito sem evidência textual nem regra → rejeitado;
- `confidence` dentro da faixa esperada.

- [ ] **Step 2: Run, confirm FAIL**

Run: `npm run test --workspace @earlycv/ai -- src/job-requirement-set.spec.ts` → FAIL.

- [ ] **Step 3: Implement `extractJobRequirementSet(client, model, { jobText, rubricVersion })`**

LLM apenas para extrair da vaga (sem CV). Saída validada por schema. `buildJobHash(jobText, rubricVersion)` exportado para cache (Task 9/persistência).

- [ ] **Step 4: PASS**

---

### Task 3: `CanonicalCvProfile` + Scorer determinístico — Formatação (§5.2, §5.6a; ponto 12)

**Files:**
- Create: `packages/ai/src/canonical-cv-profile.ts` (+ spec)
- Create: `packages/ai/src/cv-score.ts`
- Create: `packages/ai/src/cv-score.spec.ts`

- [ ] **Step 0: `CanonicalCvProfile`** — definir o formato canônico único que o scorer consome. Criar adaptadores: `fromParsedCv(text/struct)` (CV original) e `fromAdaptedJson(adaptedJson)` (saída de B). **O scorer só recebe `CanonicalCvProfile`** — nunca texto cru nem o JSON de B direto. Testes garantem que ambos os caminhos produzem a mesma estrutura para conteúdo equivalente.
- [ ] **Step 1: Failing tests** — detecção por regex de campos (nome, e-mail, telefone, LinkedIn, localização, resumo, formação, experiências com datas, habilidades) sobre `CanonicalCvProfile`; penalidades fixas; `scoreFmt = clamp(20 − penalidades, 0, 20)`; determinístico (mesmo input → mesma nota).
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement** `scoreFormatacao(profile: CanonicalCvProfile): { score, fields, problemas }`. Sem LLM.
- [ ] **Step 4: PASS**

---

### Task 4: Dicionário de aliases (`aliasVersion`) + Competências (§5.1, §5.6b)

**Files:**
- Create: `packages/ai/src/skill-aliases.ts` (dicionário versionado + `aliasVersion`)
- Modify: `packages/ai/src/cv-score.ts`
- Modify: `packages/ai/src/cv-score.spec.ts`

- [ ] **Step 1: Failing tests**
  - aliases reconhecidos (Power BI/SQL/ML conforme spec §5.1);
  - **negação** não conta (`"não tenho experiência com Python"` → Python ausente);
  - **menção simples** (peso parcial) vs **evidência em experiência** (peso cheio);
  - `scoreComp = round(Σ peso_efetivo(presentes)/Σ peso(todas) × 40)`;
  - determinístico.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement** `scoreCompetencias(cvStructured, jobRequirementSet, aliasVersion)`.
- [ ] **Step 4: PASS**

---

### Task 5: Experiência composta + integração 40/40/20 (§5.3, §5.6c/d)

**Files:**
- Modify: `packages/ai/src/cv-score.ts`
- Modify: `packages/ai/src/cv-score.spec.ts`
- (embeddings) Modify: `packages/ai/src/index.ts`

- [ ] **Step 1: Failing tests** — `scoreExperiencia` composto 40/30/20/10 (similaridade por embeddings + cobertura de requisitos críticos + senioridade + impacto); evidência equivalente via aliases; total `scoreCv = scoreExp + scoreComp + scoreFmt` (0–100); pesos/thresholds parametrizados por `rubricVersion`. Mockar embeddings nos testes para determinismo.
- [ ] **Step 1b: Versionamento de embeddings (ponto 5)** — cache de embeddings por `hash(normalizedText) + embeddingModel`; `scoreCv` retorna `embeddingModel` no metadata e a API persiste em `CvAdaptation.embeddingModel`. Trocar `embeddingModel` → cache miss (evita drift silencioso). Teste cobre cache-hit/miss por modelo.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement** `scoreExperiencia(...)` + `scoreCv(...)` que orquestra as três seções e devolve `{ scoreRaw, secoes, evidencias, embeddingModel }`.
- [ ] **Step 4: PASS**

---

### Task 6: Golden set — Fase A (antes da geração B) + comparação com score legado (§10, §14.1.3)

> O golden set é dividido em duas fases (ponto 6): **Fase A** aqui (pré-geração); **Fase B** na Task 11 (pós-geração).

**Files:**
- Create: `packages/ai/test/golden/*.json` (10–20 casos com `expected` da spec §10.1)
- Create: `packages/ai/src/cv-score-golden.spec.ts`
- Create: script `scripts/score-legacy-compare.mjs`

- [ ] **Step 1:** Escrever casos com a parte **Fase A** do `expected`: `mustDetectSkills`, `mustNotDetectSkills`, `missingFields`, lacunas, `scoreBeforeRange`. (`scoreAfterRange`/`minDelta`/lacunas-corrigidas ficam para a Fase B, Task 11.)
- [ ] **Step 2:** Teste roda o scorer sobre o CV original e valida **comportamento** (skills detectadas/não, campos ausentes, lacunas) + `scoreBeforeRange` + reprodutibilidade (2× ≤ banda §5.5).
- [ ] **Step 3:** Script compara score novo vs. score legado (de análises salvas), gera relatório de divergência. **Gate da Fase 1** (spec §14.2).

---

### Task 7: Chamada A — diagnóstico estruturado (sem score) (§6.1)

**Files:**
- Modify: `packages/ai/src/cv-adaptation.ts` (nova função `diagnoseCv`)
- Modify: `packages/ai/src/cv-adaptation.spec.ts`
- Modify: `ANALYSIS_SYSTEM_PROMPT`

- [ ] **Step 1: Failing tests** — `diagnoseCv` recebe `{ cvText, jobRequirementSet }`, retorna lacunas (corrigíveis/indisponíveis), campos ausentes, evidências, insumos qualitativos (headline, dicas, preview); **não** retorna score nem pontos; `temperature: 0` + seed.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement.** Remover do `ANALYSIS_SYSTEM_PROMPT` a "REGRA DE CALIBRAÇÃO DE PONTOS"; manter conceito de seções/tetos sem o LLM somar pontos.
- [ ] **Step 4: PASS**

---

### Task 8: API — análise gratuita: `JobRequirementSet` + scoreAntes + plano estruturado (§6.1, §6.3, §6.4)

**Files:**
- Modify: `apps/api/src/cv-adaptation/cv-adaptation-ai.service.ts`
- Modify: `apps/api/src/cv-adaptation/cv-adaptation.service.ts`
- Create: `apps/api/src/cv-adaptation/cv-adaptation-scoring.service.ts`
- Modify: specs correspondentes

- [ ] **Step 1: Failing tests** — fluxo gratuito: obtém/gera `JobRequirementSet` (com cache, Task 9), roda `diagnoseCv`, calcula `scoreAntes` determinístico, persiste `adaptationPlanJson` (diagnóstico + lacunas + recomendações + `jobRequirementSetId`/`hash` + `rubricVersion`/`aliasVersion`), `scoreBeforeRaw`. **Não** gera CV; **não** retorna conteúdo reescrito completo no payload.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement (ponto 7).** **Não substituir diretamente `analyzeAndAdaptDirect`.** Criar **nova orquestração** (`analyzeReproducible`) atrás de **feature flag** (Task 15); manter o fluxo legado intacto como **fallback** durante o rollout. A seleção legado/novo é por flag. Shape de resposta compatível com o front (Task 12 ajusta consumo).
- [ ] **Step 4: PASS** (cobrir ambos os caminhos: flag on = novo, flag off = legado).

---

### Task 9: Hash semântico + cache de reprodutibilidade global (§6.6, §6.7)

**Files:**
- Create: `apps/api/src/cv-adaptation/semantic-hash.ts` (+ spec)
- Modify: cache (novo serviço ou estender `analysis-dedupe-cache.service.ts`, mas **separado** do dedupe anti-abuso)

- [ ] **Step 1: Failing tests** — "conteúdo relevante normalizado" (§6.6): inclui resumo/experiências/cargos/empresas/datas/formação/competências/certificações/idiomas + presença/ausência de contato; ignora/normaliza nome, valor literal de e-mail/telefone/URL LinkedIn, espaços, quebras, acentos, caixa, pontuação não estrutural. Trocar valor de contato → mesmo hash; adicionar/remover campo → hash diferente.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement** `buildRelevantContentHash(profile: CanonicalCvProfile)` + cache global persistente no model **`CvEvaluationCache`** (Task 1), keyed por `@@unique([semanticHash, jobHash, rubricVersion, aliasVersion])` e gravando `embeddingModel`. `JobRequirementSet` cacheado no seu próprio model por `[jobHash, rubricVersion, aliasVersion]` (Task 2). Documentar explicitamente: este cache é **separado** do dedupe anti-abuso (`analysis-dedupe-cache.service.ts`).
- [ ] **Step 4: PASS**

---

### Task 10: Chamada B pós-pagamento, linkada ao plano + fallback + crédito (§6.2, §6.3, §6.9; pontos 10, 11)

**Files:**
- Modify: `packages/ai/src/cv-adaptation.ts` (`adaptCv` passa a receber o plano)
- Modify: `apps/api/src/cv-adaptation/cv-adaptation-ai.service.ts`
- Specs

- [ ] **Step 1: Failing tests**
  - **"B não reanalisa do zero" — testável (ponto 11):** verificar que `adaptCv` **recebe e injeta no input/prompt** `adaptationPlan`, `JobRequirementSet`, `lacunas`, `evidencias`, `camposFaltantes`, `recomendacoes`. Asserções de que B **não recalcula score** e **não cria novos requisitos da vaga**.
  - gera CV completo em JSON corrigindo as lacunas do plano; **sem** determinismo absoluto (temperatura mantida/levemente reduzida); restrições anti-alucinação.
  - **Gate:** B só é chamada quando `isUnlocked`/pago.
  - **Regra de crédito (ponto 10):** crédito só é **debitado definitivamente após** geração bem-sucedida **e** persistência do CV adaptado. Se houver **reserva** de crédito antes de B, falha **libera/devolve** a reserva.
  - **Fallback (§6.9):** se B falha → mantém A + `scoreAntes`; não seta `scoreDepois`; permite retry server-side; **não consome crédito**; loga com `correlationId` **sem CV/vaga/JSON completos**.
  - **Versões:** B usa `rubricVersion`/`aliasVersion`/`JobRequirementSet` da análise original; se rubrica mudou, usa a versão associada à análise (critério §11.9) — nunca mistura.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement** + reaproveitar `SYSTEM_PROMPT` + bloco "corrija estes pontos".
- [ ] **Step 4: PASS**

---

### Task 11: `scoreDepois` medido pós-geração + golden set Fase B (§6.4; ponto 6)

**Files:**
- Modify: `apps/api/src/cv-adaptation/cv-adaptation-ai.service.ts`
- Modify: `packages/ai/src/cv-score-golden.spec.ts`
- Specs

- [ ] **Step 1: Failing tests** — após B gerar o JSON: normalizar para `CanonicalCvProfile` (Task 3) e rodar o scorer → `scoreAfterRaw`; persistir `scoreBeforeRaw`, `scoreAfterRaw`, `scoreDelta`, `rubricVersion`, `aliasVersion`, `jobRequirementSetId`/`hash`, `embeddingModel`, ref ao CV adaptado. `scoreDepois` **não existe** antes da geração paga.
- [ ] **Step 2: Golden set Fase B (ponto 6)** — valida sobre o JSON gerado: `scoreAfterRange`, `minDelta`, **lacunas corrigidas**, qualidade do JSON adaptado e **ausência de invenção factual**. (Complementa a Fase A da Task 6.)
- [ ] **Step 3: FAIL → Implement → PASS**

---

### Task 12: Front — consumo de score, display centralizado, comunicação (§8; ponto 13)

**Files:**
- Create: `apps/web/src/lib/score-display.ts` (`getScoreDisplay`, `getScoreBand`)
- Modify: `apps/web/src/app/adaptar/resultado/normalize-data.ts`
- Modify: `apps/web/src/app/adaptar/resultado/page.tsx`
- Modify: `apps/web/src/lib/cv-adaptation-api.ts` + testes

- [ ] **Step 1: Failing tests** — front passa a **consumir** o score determinístico da API (parar de montar a nota a partir de pontos do LLM); **funções de display centralizadas** `getScoreDisplay(scoreRaw)` e `getScoreBand(scoreRaw)` (ponto 13) — o front **não reinventa** faixas/arredondamento localmente; pré-pagamento exibe `scoreAntes` + diagnóstico e linguagem **qualitativa/conservadora** para o "depois" (sem número medido); `scoreDepois` só após geração paga; caso `depois <= antes` → mensagem neutra (§8.2).
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: PASS**

---

### Task 13: Segurança (payload pré-pagamento) + retrocompat (§6.8, §11.2)

**Files:**
- Create/Modify: testes e2e/integração em `apps/api/src/cv-adaptation/*`
- Modify: front retrocompat

- [ ] **Step 1: Failing tests de segurança** — nenhum endpoint/payload pré-pagamento contém bullets/experiências/seções reescritas completas; **logs/erros/métricas não expõem CV/vaga/JSON adaptado completos** (só IDs/hashes/`correlationId`/metadata); preview público não inclui versão reescrita completa.
- [ ] **Step 2: Retrocompat** — análises legadas exibem score salvo; "reanalisar" cria nova análise com rubrica atual; UI sinaliza "metodologia atualizada" quando aplicável.
- [ ] **Step 3: Implement + PASS**

---

### Task 14: Preenchimento de campos faltantes (sem IA) — FASE POSTERIOR (§6.5; ponto 9)

> **Sequenciamento (ponto 9):** esta feature **não bloqueia** a primeira entrega. Só iniciar **depois** do fluxo base validado (scorer + plano + geração B linkada + `scoreDepois`, Tasks 1–13). Mexe em backend, front, cache e UX.

**Files:**
- Modify: `apps/api/src/cv-adaptation/*` (endpoint de merge de campo)
- Modify: `apps/web/src/app/adaptar/resultado/*`
- Specs correspondentes

- [ ] **Step 1: Failing tests** — endpoint recebe `{ adaptationId, field, value }`, mescla no `CanonicalCvProfile`/dados estruturados **sem IA**, recalcula `scoreAntes` determinístico, persiste no `adaptationPlanJson`, invalida cache por mudança de presença (MISSING→PRESENT). Nunca inventa valor.
- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implement** backend + inputs inline no front, com `scoreAntes` atualizando em tempo real.
- [ ] **Step 4: PASS**

---

### Task 15: Feature flags + rollout por fases (§14.2; ponto 15)

**Files:**
- Modify: config/flags da análise (reusar `analysis-protection/config` se aplicável)

- [ ] **Step 1:** Flag para o fluxo novo (scorer determinístico + plano + B linkada + `scoreDepois`), com seleção legado/novo (Task 8).
- [ ] **Step 2:** Métricas de gate (spec §14.2): custo médio por análise (vs. **limite a definir** — pendência §13), conversão, latência, vazamento (=0), gate de qualidade de B (§9).
- [ ] **Step 3: Fases de rollout (ponto 15):**
  - **Fase 0:** flag **desligada**.
  - **Fase 1:** flag por **conta/admin/test user**.
  - **Fase 2:** **allowlist**.
  - **Fase 3:** **percentual pequeno**.
  - **Fase 4:** **rollout amplo**.

---

### Task 16: Verificação final (AGENTS.md)

- [ ] `npm run check`
- [ ] `npm run generate --workspace @earlycv/database`
- [ ] `npm run build`
- [ ] `npm run test`
- [ ] Gate de qualidade de conteúdo (§9): comparação baseline vs. novo aprovada, sem regressão e sem fato inventado.

---

## Pendências para decidir durante a implementação

- Pesos/thresholds da Experiência (§5.3) e banda final (§5.5) — calibrar no golden set.
- Limite máximo de custo médio por análise (gate de rollout, spec §13).
- `aliasVersion` separada de `rubricVersion` já na v1? (spec §11.1) — se não, usar `@@unique([jobHash, rubricVersion])` no `JobRequirementSet` (Task 1).
- Modelo de embedding e custo (spec §13).

## Decisões fechadas (não reabrir na v1)

- **v1 = duas chamadas (ponto 4):** `JobRequirementSet` (só vaga, cacheável) + `diagnoseCv` (CV + `JobRequirementSet`). A otimização para uma única chamada fica **fora da v1**.
- Geração B sempre **pós-pagamento**; nada de gerar CV adaptado na análise gratuita.
- Scorer roda sobre `CanonicalCvProfile` único (original e adaptado normalizados).
