# Spec — Sprint 1: JobEnrichment Pipeline + Filtro Semântico + Schema Foundation

## Contexto e objetivo

Implementar a infraestrutura base do Radar de Oportunidades:

- Novos models no schema (foundation para v3.1 e v4.1)
- Filtro semântico determinístico pré-LLM (configurável em tela)
- Worker de enriquecimento assíncrono por vaga
- Ajustes no GupyAdapter para passar campos que já chegam mas são descartados
- Painel de auditoria do filtro no admin

Não implementar nesta sprint: UserRadarProfile, matching engine, UI pública do Radar, score. Esses são Sprints 2 e 3.

---

## Parte 1 — Schema (migration única)

### 1.1 Novos enums

```prisma
enum JobArea {
  DATA_AI
  SOFTWARE_ENGINEERING
  CLOUD_DEVOPS
  CYBERSECURITY
  PRODUCT
  DESIGN_UX
  QA_TEST
  PROJECT_AGILE
  ARCHITECTURE
  LEADERSHIP
  OTHER
}

enum SeniorityLevel {
  INTERN
  JUNIOR
  MID
  SENIOR
  LEAD
  STAFF
  MANAGER
  DIRECTOR
  UNKNOWN
}

enum ContractType {
  CLT
  PJ
  BOTH
  UNKNOWN
}

enum EnrichmentStatus {
  PENDING      // aguardando processamento
  PROCESSING   // worker em execução
  COMPLETED    // enriquecimento concluído
  FAILED       // LLM falhou (com retry)
  SKIPPED      // filtro semântico descartou antes do LLM
}

enum AutoApplyStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  FAILED
  RATE_LIMITED
}
```

> **Nota (Ajuste 1):** o enum `ApplicationStatus` foi removido desta spec. `JobApplication` já usa o enum `JobApplicationStatus` existente (`schema.prisma:249-261`: SAVED, ANALYZED, CV_READY, APPLIED, IN_PROCESS, INTERVIEW, ASSESSMENT, OFFER, HIRED, REJECTED, WITHDRAWN) — não há necessidade de um enum novo. Os campos de Auto Apply (`AutoApplyStatus` e os campos relacionados na Parte 1.4) permanecem, pois são conceitos novos sem equivalente hoje.

### 1.2 Novo model JobEnrichment

```prisma
model JobEnrichment {
  id                   String          @id @default(cuid())
  jobId                String          @unique
  job                  Job             @relation(fields: [jobId], references: [id], onDelete: Cascade)

  // Taxonomia (output do LLM)
  dominantArea         JobArea?
  areas                JobArea[]
  specialties          String[]        // ex: ["backend", "java", "microservices"]
  seniority            SeniorityLevel?
  requiredSkills       String[]
  optionalSkills       String[]
  technologies         String[]
  contractType         ContractType?
  languageRequirements String[]
  certifications       String[]
  experienceYearsMin   Int?
  managementRequired   Boolean         @default(false)
  travelRequired       Boolean         @default(false)
  careerFingerprint    String[]        // ex: ["Backend Engineer", "Cloud", "Java", "Senior"]

  // Filtro semântico (preenchido antes do LLM)
  semanticFilterResult SemanticFilterResult @default(PENDING)
  semanticFilterReason String?             // qual signal disparou (ou "zona_cinza")
  semanticFilterVersion String?            // versão da config que gerou o resultado

  // Metadados do enriquecimento
  enrichmentStatus     EnrichmentStatus @default(PENDING)
  enrichmentVersion    String?          // versão do prompt
  enrichmentModel      String?          // modelo usado ex: "deepseek/deepseek-v3"
  enrichmentError      String?
  enrichedAt           DateTime?
  attempts             Int              @default(0)

  createdAt            DateTime         @default(now())
  updatedAt            DateTime         @updatedAt

  @@index([enrichmentStatus])
  @@index([semanticFilterResult])
  @@index([dominantArea])
  @@index([seniority])
}

enum SemanticFilterResult {
  PENDING    // ainda não processado
  ENRICH     // passou — deve enriquecer com LLM
  SKIP       // descartado — não enriquece
}
```

> **Nota (Ajuste 4):** o campo era `retryCount` na versão anterior da spec; renomeado para `attempts` para seguir a convenção já usada em `MasterCvCanonicalExtraction.attempts` (`schema.prisma:641`). Todas as referências na Parte 4 (lógica do worker) foram atualizadas de acordo.

### 1.3 Novo model SemanticFilterConfig

Configuração do filtro semântico armazenada no banco, editável em tela sem deploy.

```prisma
model SemanticFilterConfig {
  id          String   @id @default(cuid())
  version     String   @unique  // ex: "v1", "v2"
  isActive    Boolean  @default(false)  // só uma ativa por vez
  techSignals String[]  // keywords que indicam vaga tech
  noiseSignals String[] // keywords que indicam ruído óbvio
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### 1.4 Ajuste em JobApplication (existente)

Adicionar campo opcional para conectar candidatura a vaga ingerida:

```prisma
// Adicionar ao model JobApplication existente:
jobId         String?      // FK opcional: quando candidatura vem do Radar
job           Job?         @relation(fields: [jobId], references: [id], onDelete: SetNull)

// Para v4.1 Auto Apply (adicionar agora):
autoApplyEnabled     Boolean          @default(false)
autoApplyStatus      AutoApplyStatus?
autoApplyAttemptedAt DateTime?
autoApplyCompletedAt DateTime?
autoApplyResultJson  Json?
externalApplicationId String?
externalApplicationUrl String?

resumeUsedId  String?  // v4.1 Auto Apply: CV master/base usado na candidatura automática
                       // Diferente de currentCvAdaptationId (CV adaptado para a vaga específica)
resumeUsed    Resume?  @relation("JobApplicationResume", fields: [resumeUsedId], references: [id], onDelete: SetNull)

matchScore           Int?
matchSnapshotJson    Json?
```

> **Nota (Ajuste 7):** comentário inline adicionado em `resumeUsedId` para deixar explícito que ele é distinto de `currentCvAdaptationId` (campo já existente em `schema.prisma:1279`, que aponta para o CV *adaptado* para a vaga específica). `resumeUsedId` aponta para o `Resume` master/base usado como origem na candidatura automática do Auto Apply — os dois campos convivem no mesmo model com propósitos diferentes.

### 1.5 Ajuste em Job (existente)

Adicionar relação com JobEnrichment e JobApplication:

```prisma
// Adicionar ao model Job:
enrichment    JobEnrichment?
applications  JobApplication[]
```

### 1.6 Config de enriquecimento

Adicionar ao `SemanticFilterConfig` seed inicial (via migration seed ou fixture):

```
version: "v1"
isActive: true
techSignals: [
  "desenvolvedor", "developer", "engenheiro", "engineer",
  "analista de dados", "data analyst", "data engineer", "data science",
  "software", "backend", "front-end", "frontend", "full stack", "fullstack",
  "mobile", "devops", "cloud", "sre", "platform", "site reliability",
  "produto", "product manager", "product owner", "ux", "ui designer",
  "qa", "quality assurance", "teste", "tester", "automação de testes",
  "segurança", "security", "cybersecurity", "cyber", "pentest",
  "infraestrutura", "infra", "redes", "network",
  "arquiteto", "architect", "solutions architect",
  "scrum master", "agile coach", "tech lead", "cto", "cio",
  "machine learning", "inteligência artificial", "ia", "llm", "mlops",
  "analytics", "business intelligence", "bi ", " bi",
  "database", "dba", "banco de dados",
  "suporte de ti", "suporte técnico ti", "analista de ti",
  "sistemas", "analista de sistemas",
  "gerente de ti", "coordenador de ti", "head de tecnologia",
  "head de dados", "head de produto", "head de engenharia"
]
noiseSignals: [
  "enfermeiro", "técnico de enfermagem", "médico", "farmacêutico",
  "biomédico", "fisioterapeuta", "psicólogo", "nutricionista",
  "recepcionista", "atendente", "operador de caixa",
  "vendedor", "assistente de vendas", "agente de vendas",
  "montador", "mecânico", "eletricista", "soldador",
  "motorista", "operador de máquinas",
  "assistente de loja", "fiscal de loja", "gerente de loja",
  "estoquista", "armazenista", "almoxarife",
  "auxiliar de limpeza", "zelador", "porteiro",
  "aprendiz", "jovem aprendiz",
  "pedagogo", "professor", "docente",
  "advogado", "contador", "analista contábil", "analista fiscal"
]
```

---

## Parte 2 — GupyAdapter: passar campos descartados

Arquivo: `apps/api/src/ingestion/adapters/gupy.adapter.ts`

Arquivo de tipos: `apps/api/src/ingestion/types.ts`

### 2.1 Estender NormalizedJobObservation

Adicionar campos ao tipo existente:

```typescript
export interface NormalizedJobObservation {
  // campos existentes mantidos
  // adicionar:
  department?: string | null      // departmentName da Gupy API ou department do board HTML
  employmentTypeRaw?: string | null  // vacancy_type_* bruto (para normalização posterior)
}
```

### 2.2 Normalizar employmentType no adapter

Hoje o adapter passa o valor bruto da Gupy (`job.type?.trim()`, `gupy.adapter.ts:381`) direto para `employmentType`, sem normalização. Adicionar mapeamento:

```typescript
function normalizeEmploymentType(raw: string | null | undefined): string | null {
  const map: Record<string, string> = {
    vacancy_type_effective: 'full_time',
    vacancy_type_internship: 'internship',
    vacancy_type_apprentice: 'apprentice',
    vacancy_type_temporary: 'temporary',
    vacancy_type_talent_pool: 'talent_pool',
    vacancy_legal_entity: 'pj',
    vacancy_type_autonomous: 'autonomous',
    full_time: 'full_time',
  }
  return raw ? (map[raw.trim()] ?? raw.trim()) : null
}
```

Aplicar em `toObservation()`.

> **Nota (Ajuste 5):** o mapa acima foi construído com base nos valores de `vacancy_type_*` observados no banco atual: `vacancy_type_effective`, `vacancy_type_internship`, `vacancy_type_apprentice`, `vacancy_type_temporary`, `vacancy_type_talent_pool`, `vacancy_legal_entity`, `vacancy_type_autonomous`, `full_time`. Antes de implementar, validar esse conjunto contra os valores reais persistidos em `Job.employmentType` (fonte: dados já ingeridos, não payload de API não testado). Os testes da Parte 6 devem incluir um caso de normalização para **cada** um desses 8 valores, garantindo cobertura completa do mapa (não apenas 1-2 casos de exemplo).

### 2.3 Mapear department em toObservation()

```typescript
// API path: job.departmentName
// HTML path: boardJob.department
// Passar ambos para NormalizedJobObservation.department
```

`departmentName` já é capturado no `GupyApiJob` (`gupy.adapter.ts:15,237,299`) mas nunca chega em `toObservation()` — hoje é dado descartado.

### 2.4 IngestionService: persistir department em Job.metadataJson

Até ter coluna própria, persiste em `metadataJson: { department: string }`. O enriquecimento vai ler de lá.

---

## Parte 3 — Filtro semântico (SemanticFilterService)

Arquivo novo: `apps/api/src/ingestion/semantic-filter.service.ts`

### 3.1 Interface

```typescript
export type SemanticFilterDecision = {
  result: 'ENRICH' | 'SKIP'
  reason: string       // ex: "tech_signal:desenvolvedor" | "noise_signal:enfermeiro" | "zona_cinza"
  configVersion: string
}

@Injectable()
export class SemanticFilterService {
  async evaluate(normalizedTitle: string): Promise<SemanticFilterDecision>
  async getActiveConfig(): Promise<SemanticFilterConfig>
}
```

### 3.2 Lógica

```
1. Carrega config ativa do banco (com cache TTL 5min — não bate no banco a cada vaga)
2. Normaliza título: lowercase, remove acentos, remove sufixos geográficos comuns
   ex: "analista de TI Sênior - São Paulo" → "analista de ti senior"
3. Verifica noiseSignals primeiro (mais rápido, elimina óbvio)
   → retorna SKIP com reason "noise_signal:<termo>"
4. Verifica techSignals
   → retorna ENRICH com reason "tech_signal:<termo>"
5. Zona cinza (nenhum signal encontrado)
   → retorna SKIP com reason "zona_cinza"
```

---

## Parte 4 — Worker de enriquecimento (JobEnrichmentWorker)

Arquivo novo: `apps/api/src/ingestion/job-enrichment.worker.ts`

> **Nota (Ajuste 3):** não existe fila real no projeto (`@earlycv/queue` só define nomes de string, sem client BullMQ/pg-boss instalado). O mecanismo é `@Cron` (NestJS Schedule) com polling em lote na tabela `JobEnrichment`, seguindo o mesmo padrão de `IngestionManualRunnerService` (`apps/api/src/ingestion/ingestion-manual-runner.service.ts:96`): tick agendado + lock de banco via `IngestionLockRepository` para evitar processamento duplicado entre réplicas do Railway.

### 4.1 Trigger

Após cada upsert de Job novo no IngestionService:

- Cria `JobEnrichment` com `enrichmentStatus: PENDING`
- O worker (`@Cron`) recolhe as pendências no próximo tick — não há enfileiramento explícito, o estado `PENDING` na tabela já é o sinal.

> **Nota (Ajuste 6):** o enriquecimento é disparado apenas na criação de Job novo (`if (!existingJob)` em `ingestion.service.ts:538`). Vagas existentes não são re-enriquecidas automaticamente em updates. Re-enriquecimento manual é possível via botão "Enriquecer mesmo assim" no painel de auditoria (Parte 5.2).

### 4.2 Fluxo do worker

```
1. @Cron dispara no intervalo configurado (ENRICHMENT_CRON_EXPRESSION)
2. Tenta adquirir lock de banco via IngestionLockRepository (mesmo padrão do IngestionManualRunnerService); se não conseguir, no-op nesse tick
3. Busca JobEnrichment com status PENDING (batch de até ENRICHMENT_BATCH_SIZE, sequencial)
4. Marca como PROCESSING
5. Roda SemanticFilterService.evaluate(job.normalizedTitle)
6. Salva resultado do filtro (semanticFilterResult, semanticFilterReason, semanticFilterVersion)
7. Se SKIP:
   → status = SKIPPED
   → próximo item
8. Se ENRICH:
   → Monta prompt com: title, normalizedTitle, descriptionClean (truncado em 2000 chars), department
   → Chama LLM via createAiClientFromEnv('JOB_ENRICHMENT') / getAiModel('JOB_ENRICHMENT')
   → Parseia resposta JSON
   → Salva todos os campos em JobEnrichment
   → status = COMPLETED
9. Em caso de erro do LLM:
   → attempts++
   → Se attempts < 3: volta para PENDING
   → Se attempts >= 3: status = FAILED com enrichmentError
10. Libera o lock ao final do tick (finally)
```

### 4.3 Prompt de enriquecimento (versão calibrada com dados reais)

```
Você é um sistema de classificação de vagas de emprego para um radar de oportunidades tech.

Analise a vaga abaixo e retorne EXCLUSIVAMENTE um JSON válido no formato especificado.

## Vaga
Título: {title}
Empresa/Departamento: {department ?? "não informado"}
Descrição: {descriptionClean (2000 chars)}

## Taxonomia de áreas disponíveis
DATA_AI: dados, analytics, BI, data engineering, data science, machine learning, AI, MLOps
SOFTWARE_ENGINEERING: desenvolvimento backend, frontend, fullstack, mobile, embedded
CLOUD_DEVOPS: cloud, devops, SRE, platform engineering, infraestrutura, redes
CYBERSECURITY: segurança da informação, pentest, AppSec, SOC, GRC, IAM
PRODUCT: product manager, product owner, gestão de produto
DESIGN_UX: UX design, UI design, product design, UX research
QA_TEST: QA, quality assurance, teste, automação de testes
PROJECT_AGILE: scrum master, agile coach, gestão de projetos tech, PMO tech
ARCHITECTURE: arquiteto de software, solutions architect, enterprise architect
LEADERSHIP: tech lead com gestão, engineering manager, head, CTO, CIO, diretor tech
OTHER: qualquer coisa que não se encaixe nas categorias acima

## Formato de resposta (JSON estrito, sem texto fora do JSON)
{
  "dominantArea": "<JobArea>",
  "areas": ["<JobArea>"],
  "specialties": ["<string>"],
  "seniority": "<SeniorityLevel>",
  "requiredSkills": ["<string>"],
  "optionalSkills": ["<string>"],
  "technologies": ["<string>"],
  "contractType": "<ContractType>",
  "languageRequirements": ["<string>"],
  "certifications": [],
  "experienceYearsMin": <int ou null>,
  "managementRequired": <boolean>,
  "travelRequired": <boolean>,
  "careerFingerprint": ["<string>"]
}

## Regras importantes
- Se dominantArea for OTHER, retorne o JSON com todos os outros campos vazios/null
- careerFingerprint: máximo 6 labels concisos em português que descrevem o profissional ideal (ex: ["Engenheiro Backend", "Java", "AWS", "Microsserviços", "Sênior"])
- requiredSkills: só o que é explicitamente obrigatório na descrição
- optionalSkills: o que é "diferencial" ou "desejável"
- technologies: frameworks, linguagens, ferramentas (ex: "Python", "React", "Kubernetes")
- specialties: sub-área dentro da área principal (ex: para DATA_AI: "data engineering", "analytics")
- Normalize para lowercase em requiredSkills, optionalSkills, technologies
- SeniorityLevel válidos: INTERN | JUNIOR | MID | SENIOR | LEAD | STAFF | MANAGER | DIRECTOR | UNKNOWN
- ContractType válidos: CLT | PJ | BOTH | UNKNOWN
- Se informação não disponível, use null ou [] — nunca invente
```

### 4.4 Env vars necessárias

```
AI_SUPPLIER_JOB_ENRICHMENT=openrouter|deepseek/deepseek-v3
ENRICHMENT_BATCH_SIZE=10
ENRICHMENT_CRON_EXPRESSION=*/10 * * * * *
```

> **Nota (Ajustes 2 e 3):** `ENRICHMENT_MODEL` foi removido — o modelo/supplier é resolvido via `createAiClientFromEnv('JOB_ENRICHMENT')` e `getAiModel('JOB_ENRICHMENT')` (`apps/api/src/common/ai-client-factory.ts`), seguindo o padrão `AI_SUPPLIER_<OPERATION>` já usado no projeto. `ENRICHMENT_WORKER_INTERVAL_MS` foi removido em favor de `ENRICHMENT_CRON_EXPRESSION`, cron expression consumida por `@Cron(...)`, com default `*/10 * * * * *` (a cada 10 segundos), igual ao `IngestionManualRunnerService`.

---

## Parte 5 — Painel de auditoria do filtro (Admin UI)

Localização: nova sub-aba "Filtro" dentro de `/admin/ingestion` ou página separada `/admin/ingestion/filter`

### 5.1 Seção: Config ativa

- Exibe versão ativa, data de criação
- Lista editável de techSignals (textarea com um item por linha ou tags)
- Lista editável de noiseSignals (idem)
- Botão "Salvar como nova versão" (cria novo registro com versão incrementada, ativa automaticamente)
- Não edita a versão atual — sempre cria nova versão (histórico preservado)

### 5.2 Seção: Vagas SKIPPED (para ajuste do filtro)

Tabela paginada (20 por página) com:

- normalizedTitle
- sourceName (via join)
- semanticFilterReason ("noise_signal:enfermeiro" ou "zona_cinza")
- enrichmentStatus (sempre SKIPPED aqui)
- firstSeenAt
- Botão "Enriquecer mesmo assim" → marca vaga como PENDING novamente, reseta attempts

Filtros:

- Por semanticFilterReason (dropdown: zona_cinza | noise_signal | tech_signal)
- Por sourceName
- Por data range

### 5.3 Cards de status do enriquecimento

Adicionar ao dashboard existente (ou criar painel novo):

- Total PENDING
- Total PROCESSING
- Total COMPLETED (últimas 24h)
- Total SKIPPED (últimas 24h)
- Total FAILED
- Taxa de aprovação do filtro: COMPLETED / (COMPLETED + SKIPPED) %

---

## Parte 6 — Tests

### API

```
apps/api/src/ingestion/semantic-filter.service.spec.ts
- título com tech signal → ENRICH com reason correto
- título com noise signal → SKIP com reason correto
- título zona cinza → SKIP com reason "zona_cinza"
- sufixo geográfico é removido antes da avaliação
- cache da config é respeitado (não bate no banco em chamadas consecutivas)

apps/api/src/ingestion/job-enrichment.worker.spec.ts
- vaga SKIPPED pelo filtro não chama LLM
- vaga ENRICH chama LLM e persiste campos
- falha do LLM incrementa attempts
- attempts >= 3 marca como FAILED
- resposta com dominantArea = OTHER marca como COMPLETED mas não expõe no Radar

apps/api/src/ingestion/adapters/gupy.adapter.spec.ts (ou arquivo já existente)
- normalizeEmploymentType cobre os 8 valores mapeados: vacancy_type_effective,
  vacancy_type_internship, vacancy_type_apprentice, vacancy_type_temporary,
  vacancy_type_talent_pool, vacancy_legal_entity, vacancy_type_autonomous, full_time
- valor não mapeado passa como raw (fallback)
```

### Web

```
apps/web/src/app/admin/ingestion/filter/ (novo)
- config ativa é exibida corretamente
- salvar nova versão cria registro novo e ativa
- tabela de SKIPPED pagina e filtra corretamente
- botão "Enriquecer mesmo assim" reseta status da vaga
```

---

## Parte 7 — Ordem de implementação (commits separados)

```
1. feat(schema): add JobEnrichment, SemanticFilterConfig, enums, JobApplication fields
   → migration + prisma generate

2. feat(ingestion/gupy): map department and normalize employmentType in adapter
   → gupy.adapter.ts + types.ts

3. feat(ingestion): SemanticFilterService with configurable keyword lists
   → semantic-filter.service.ts + spec

4. feat(ingestion): JobEnrichmentWorker with LLM enrichment pipeline (@Cron + lock)
   → job-enrichment.worker.ts + spec

5. feat(ingestion/service): trigger enrichment after job upsert
   → ingestion.service.ts

6. feat(admin/ingestion): filter audit panel (config + skipped jobs + dashboard cards)
   → UI + endpoints admin

7. seed: SemanticFilterConfig v1 with initial keyword lists
   → migration seed ou fixture
```

---

## Parte 8 — Restrições

- Não implementar UserRadarProfile, matching engine, score, ou UI pública do Radar — são Sprint 2 e 3
- Não modificar o fluxo de adaptação de CV existente — zero risco de regressão no produto atual
- Enriquecimento nunca bloqueia ingestão — se worker falhar, Job já está salvo e visível no admin
- LLM sempre via OpenRouter, usando `createAiClientFromEnv('JOB_ENRICHMENT')` / `getAiModel('JOB_ENRICHMENT')` (`apps/api/src/common/ai-client-factory.ts`) — nunca um client novo
- Modelo/supplier configurável via `AI_SUPPLIER_JOB_ENRICHMENT` — sem hardcode
- Worker de enriquecimento roda via `@Cron` com lock de banco (`IngestionLockRepository`), não via fila — sem hardcode
- Não remover nem alterar campos existentes em Job — só adicionar relação e metadataJson
- Migration única para todos os novos models e enums desta sprint
- Não mergear em main sem smoke manual validado — Paulo autoriza o merge
