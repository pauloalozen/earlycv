# Plano fechado v3 — pipeline de perfil canônico de CV (Opção A)

**Data:** 2026-09-04 (revisão 3, aprovada para implementação por fases)
**Status:** plano fechado. **Aprovado — implementação inicia pela Fase 1, atrás de flag, com relatório de migrations/testes ao fim de cada fase.**
**Substitui:** a revisão 2 deste arquivo, corrigida em 5 pontos: (1) processamento de CV não é mais `AnalysisJob` — vira `CvProcessingJob` genérico, do qual `AnalysisJob` depende quando existe análise; (2) claim nunca transfere `CvSource` — sempre `ClaimSourceGrant`, mesmo sem colisão de hash; (3) semântica de concorrência de Master corrigida (`PROMOTE_IF_FIRST` = primeira vence, `PROMOTE_EXPLICIT` = última serializada vence); (4) claim de Master vira uma unidade durável completa (Resume + designação + `UserProfile` + `MonitorProjectionJob` + auditoria); (5) `MonitorProjectionJob` só é criado quando o Master muda de fato, nunca em toda análise não-Master.
**Regra inegociável:** nenhuma fase apaga ou torna incompatível o que já existe. Todo schema novo é aditivo; nenhuma FK histórica é reapontada só por conveniência de deduplicação.

---

## 1. Processamento assíncrono durável — `CvProcessingJob` separado de `AnalysisJob`

**Correção de fundo**: processar um CV (extrair, popular Base de Talentos, opcionalmente promover Master) e analisar um CV contra uma vaga são operações diferentes. Upload/substituição de Master sem nenhuma análise **não cria `AnalysisJob`** — cria só um `CvProcessingJob`. `AnalysisJob` passa a ser exclusivamente "análise CV × vaga" e, quando existe, **depende** de um `CvProcessingJob`.

### 1.1 `CvProcessingJob` — genérico, responsável só pelo processamento do CV

```prisma
enum CvProcessingJobStatus {
  PENDING
  PROCESSING
  READY
  FAILED
}

enum CvProcessingMasterIntent {
  NONE
  PROMOTE_IF_FIRST
  PROMOTE_EXPLICIT
}

model CvProcessingJob {
  id String @id @default(cuid())

  cvSourceId     String
  cvSubmissionId String

  masterIntent CvProcessingMasterIntent @default(NONE)

  status    CvProcessingJobStatus @default(PENDING)
  attempts  Int                   @default(0)
  claimedAt DateTime?
  workerId  String?
  lastError String?

  cvStructuredProfileId String? // preenchido quando a extração conclui
  masterDesignationId   String? // preenchido só se este job efetivamente promoveu/trocou o Master

  createdAt  DateTime  @default(now())
  finishedAt DateTime?

  cvSource     CvSource     @relation(fields: [cvSourceId], references: [id])
  cvSubmission CvSubmission @relation(fields: [cvSubmissionId], references: [id])
  analysisJobs AnalysisJob[]

  @@index([status])
  @@index([cvSourceId])
}
```

Responsabilidades exclusivas do `CvProcessingJob` (sempre, para todo processamento de CV, com ou sem análise em seguida):
1. Reivindica o job (`PENDING → PROCESSING`, `claimedAt`/`workerId`, transação curta).
2. Garante `CvStructuredProfile READY` (extração — chamada de IA fora de qualquer transação).
3. Persiste `TalentProfile`/observações (seção 2) — sempre, independente de Master.
4. Se `masterIntent != NONE`, promove o Master (seção 10) e, só então, sincroniza `UserProfile` e cria o `MonitorProjectionJob` **apenas quando o Master de fato mudou** (regra fechada na seção 17 — nunca em toda passada do job).
5. Marca `status = READY` (ou `FAILED` com `lastError`).

### 1.2 `AnalysisJob` — só análise CV × vaga, depende do processamento

```prisma
model AnalysisJob {
  // ...campos existentes inalterados...
  cvProcessingJobId String? // dependência; null só nas linhas históricas pré-migração
  cvProcessingJob    CvProcessingJob? @relation(fields: [cvProcessingJobId], references: [id])
  // cvStructuredProfileId continua existindo como referência final —
  // é preenchido a partir do cvProcessingJob.cvStructuredProfileId quando ele fica READY.
}
```

Fluxo de uma análise (upload/texto novo + comparação com vaga, num único request do usuário):
1. Entrypoint cria, na mesma transação curta: `CvSource`+`CvSubmission` (se necessário — pode reusar um já existente), um `CvProcessingJob` (se não existir um `READY` reaproveitável para aquele `cvSourceId`+versão de extrator/schema — mesma checagem de dedup da revisão anterior), e o `AnalysisJob` já apontando `cvProcessingJobId`. Responde `{ jobId: analysisJob.id }` de imediato.
2. **O worker de análise nunca extrai CV.** Ele só roda quando `CvProcessingJob.status = READY` (filtra `WHERE cvProcessingJob.status = 'READY' AND analysisJob.status = 'pending'`, ou é acordado por notificação — decisão de implementação, não de arquitetura). Ao rodar, lê `CvStructuredProfile` via `cvProcessingJob.cvStructuredProfileId` e executa a análise.
3. Se `CvProcessingJob` falha (`FAILED`), o `AnalysisJob` correspondente também vai a `FAILED`, com `lastError` refletindo a causa raiz (nunca reexecuta a extração por conta própria).

### 1.3 Polling — upload isolado vs. análise

- **Upload/substituição de Master sem análise**: frontend faz polling em `GET /cv-processing-jobs/:id`.
- **Análise CV × vaga**: frontend faz polling em `GET /analysis-jobs/:id`, que **expõe o estado da dependência sem duplicar trabalho** — a resposta inclui `{ status, cvProcessing: { status, error } }`, projetado a partir de um `JOIN` simples no `cvProcessingJobId`, nunca reprocessando nem espelhando dados em outra tabela.

### 1.4 Retry — cada job tem seu próprio ciclo, sem repetir o do outro

- **Retry do `CvProcessingJob`** (extração falhou): reseta `status: PENDING, attempts+1`; **não cria outro `AnalysisJob`** — os `AnalysisJob`s existentes que dependem dele voltam a poder prosseguir assim que ele chegar em `READY`.
- **Retry do `AnalysisJob`** (a análise em si falhou, mas a extração já está `READY`): reseta só o `AnalysisJob`, **nunca reexecuta a extração** — lê o `CvStructuredProfile` já pronto de novo.
- Mesmo padrão de recuperação de `processing` travado (`recoverStaleProcessing()`) aplicado a ambos os jobs, independentemente.

**Garantia formal ao marcar `CvProcessingJob.status = READY`**:
- `CvStructuredProfile.status = READY`;
- os dados/observações da Base de Talentos para aquele `CvStructuredProfile` já foram persistidos;
- se `masterIntent != NONE` e a promoção de fato aconteceu: `CvMasterDesignation`, `Resume` e `UserProfile` consistentes, e `MonitorProjectionJob` persistido (regra da seção 17);
- nada do que falta depende de estado em memória do processo.

**Garantia formal ao marcar `AnalysisJob.status = "succeeded"`** (dado que seu `CvProcessingJob` já é `READY`):
- `AnalysisJob.cvStructuredProfileId` preenchido a partir do processamento;
- a análise foi executada com o conteúdo daquele `CvStructuredProfile` (nunca texto bruto);
- nenhuma dependência de `Promise` solta pós-resposta HTTP.

---

## 2. Toda análise alimenta a Base de Talentos

A captura de `TalentProfile`/observações deixa de estar condicionada a "virou Master". Passa a ser um passo fixo do worker (passo 3.4 acima), disparado para **todo** `CvStructuredProfile` que chega a `READY` — guest ou logado, Master ou não, arquivo ou texto colado.

O que essa etapa faz, sempre:
1. Localiza/cria o sujeito (`TalentSubject` pra guest, `User` pra logado — seção 3).
2. Localiza/cria o `TalentProfile` daquele sujeito.
3. Registra a contribuição da fonte (`TalentProfileSource`, seção 3).
4. Roda `applyCanonicalProfile()` (já existe, será unificado — ver seção 5) inserindo experiências/competências/formações/idiomas/certificações com proveniência por CV (seção 8, com a correção do fingerprint).

**Master não participa dessa etapa.** Master só controla as projeções `UserProfile`/`UserRadarProfile` — nunca decide se a Base de Talentos recebe dado ou não.

---

## 3. Sujeito anônimo formal (`TalentSubject`) — sem sessão como identidade definitiva

Corrigindo a v1 (que usava `guestSessionHash` como se fosse a identidade do visitante): a sessão vira só um **sinal de localização**, nunca a identidade conceitual.

```prisma
model TalentSubject {
  id String @id @default(cuid())

  createdAt DateTime @default(now())

  // Preenchido só quando um merge/claim acontece — nunca apaga o
  // TalentSubject, só aponta pra onde ele foi consolidado.
  mergedIntoUserId        String?
  mergedIntoTalentProfileId String?
  mergedAt                DateTime?

  sessionSignals TalentSubjectSessionSignal[]
  cvSources      CvSource[]
  talentProfile  TalentProfile?

  @@index([mergedIntoUserId])
}

// guestSessionHash localiza o sujeito, mas N sessões podem apontar pro
// mesmo sujeito (ex.: o resolver de identidade já existente decidiu que
// duas sessões são a mesma pessoa) — é uma tabela de sinais, não uma FK
// direta em CvSource.
model TalentSubjectSessionSignal {
  id              String   @id @default(cuid())
  talentSubjectId String
  guestSessionHash String  @unique
  firstSeenAt     DateTime @default(now())
  lastSeenAt      DateTime @default(now())

  talentSubject TalentSubject @relation(fields: [talentSubjectId], references: [id], onDelete: Cascade)

  @@index([talentSubjectId])
}
```

- **Localização por sessão**: ao chegar uma nova sessão de guest, busca `TalentSubjectSessionSignal` por `guestSessionHash`. Se existir, usa o `TalentSubject` já vinculado. Se não existir, roda o resolver de identidade existente (`TalentIdentityResolver`, sinais fortes tipo e-mail/telefone declarado) contra sujeitos já conhecidos; se achar match forte, vincula a sessão nova ao sujeito existente (**gera evento de auditoria**, nunca silencioso — `TalentSubjectSessionLinkEvent` ou reaproveita `TalentIdentityConflict` quando o sinal é ambíguo); se não achar nada, cria um `TalentSubject` novo.
- **Vários CVs da mesma sessão**: todos os `CvSource` daquela sessão (mesmo `guestSessionHash` → mesmo `TalentSubject` via o sinal) apontam pro mesmo `TalentSubject.id`, logo pro mesmo `TalentProfile`.
- **`TalentProfile`** passa a pertencer a `TalentSubject` OU `User`, nunca diretamente a uma sessão ou a um `CvSource`:

```prisma
model TalentProfile {
  // ...campos existentes de cache/consolidado, mantidos...
  userId          String?        @unique
  talentSubjectId String?        @unique
  user            User?          @relation(fields: [userId], references: [id], onDelete: Cascade)
  talentSubject   TalentSubject? @relation(fields: [talentSubjectId], references: [id], onDelete: SetNull)

  sources TalentProfileSource[]

  // exatamente um dos dois donos deve existir — CHECK constraint, seção 7
}

// Relação formal entre o perfil e TODAS as fontes que contribuíram —
// substitui a leitura implícita via originSourceRecordId (que continua
// existindo só como "qual foi a primeira fonte", não como lista completa).
model TalentProfileSource {
  id              String   @id @default(cuid())
  talentProfileId String
  cvSourceId      String
  contributedAt   DateTime @default(now())

  talentProfile TalentProfile @relation(fields: [talentProfileId], references: [id], onDelete: Cascade)
  cvSource      CvSource      @relation(fields: [cvSourceId], references: [id], onDelete: Cascade)

  @@unique([talentProfileId, cvSourceId])
}
```

- **Merge sujeito↔sujeito ou sujeito↔usuário nunca é silencioso.** Todo merge (seja pelo resolver batendo um sinal forte numa sessão nova, seja pelo claim explícito na seção 4) grava uma linha de auditoria:

```prisma
enum TalentSubjectMergeReason {
  STRONG_SIGNAL_MATCH   // resolver bateu e-mail/telefone entre sessões
  CLAIM_FULL            // claim cobriu 100% das fontes do sujeito
  CLAIM_PARTIAL_COPY    // claim cobriu só parte; copiou observações, não fundiu o sujeito
  MANUAL_ADMIN_REVIEW
}

model TalentSubjectMergeEvent {
  id              String   @id @default(cuid())
  talentSubjectId String
  targetUserId    String?
  targetTalentSubjectId String?
  reason          TalentSubjectMergeReason
  triggeringAnalysisJobId String?
  createdAt       DateTime @default(now())

  @@index([talentSubjectId])
}
```

Nunca existe um caminho de código que funde dois `TalentProfile`/`TalentSubject` só porque e-mail ou telefone inferido bateu — isso sempre passa por `STRONG_SIGNAL_MATCH` com o evento gravado, igual ao `TalentIdentityConflict` que já existe hoje pra casos ambíguos (fica registrado pra revisão humana, nunca aplicado automaticamente quando ambíguo).

---

## 4. Claim fechado — granular por fonte, nunca em bloco por sessão

**Princípio central**: o claim nunca transfere "tudo que compartilha uma sessão". Ele transfere exatamente as fontes comprovadas pelo token/posse apresentado na chamada — hoje isso já existe como o token de ownership por `AnalysisJob`/`CvAdaptation` (`claimGuest`/`claimGuestAnalysisJob`, mecanismo já auditado e mantido).

### 4.1 Primitiva reutilizável: `ClaimSourceGrant`

```prisma
model ClaimSourceGrant {
  id                  String   @id @default(cuid())
  cvSourceId          String
  userId              String
  grantedAt           DateTime @default(now())
  provenByAnalysisJobId String

  cvSource CvSource @relation(fields: [cvSourceId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([cvSourceId, userId])
}
```

Representa "este usuário tem acesso comprovado a esta fonte" — independente de quem é o dono formal do `CvSource` (resolve exatamente o caso de colisão de hash, seção 4.3).

### 4.2 Transação de claim (um `AnalysisJob`/`CvAdaptation` por vez, idempotente)

Dado um `userId` + um token de posse identificando um `AnalysisJob`/`CvAdaptation` específico:

1. Resolve a cadeia: `AnalysisJob` → `CvSubmission` → `CvSource` → (se existir) `CvStructuredProfile` → `TalentProfileSource` → `TalentSubject`.
2. **Grant** (idempotente — `create` protegido por `@@unique`, ignora se já existe): cria `ClaimSourceGrant(cvSourceId, userId, provenByAnalysisJobId)`.
3. **`CvSource` nunca é transferido, com ou sem colisão de hash.** `CvSource` preserva para sempre o sujeito/proprietário que originou historicamente aquela fonte (`ownerType: GUEST`, `talentSubjectId` inalterado). O que muda é só a existência do `ClaimSourceGrant` do passo 2 — essa é a única coisa que passa a dar ao usuário acesso formal àquela fonte. `Resume`/`CvMasterDesignation` do usuário podem daqui em diante apontar para essa fonte porque possuem ownership direto **ou** um `ClaimSourceGrant` válido (seção 6/7, trigger revisada).
4. **Ownership do `AnalysisJob`/`CvAdaptation`**: reatribuição já existente hoje, mantida — isso continua mudando de dono (é o registro da análise em si, não a fonte de conteúdo).
5. **Resolução do sujeito** (avalia depois do grant do passo 2 estar persistido):
   - Lista todas as `TalentProfileSource` do `TalentSubject` em questão.
   - Se **todas** já têm `ClaimSourceGrant` para este `userId` → merge completo: se o usuário não tem `TalentProfile`, reaponta o `TalentProfile.talentSubjectId → null / userId → user` (mesma linha, preserva observações, zero cópia); se o usuário já tem `TalentProfile`, funde as observações (insere por fingerprint as que faltam, nunca duplica) no perfil do usuário e marca o `TalentProfile` do guest com `mergedIntoTalentProfileId`. Grava `TalentSubjectMergeEvent(reason: CLAIM_FULL)`.
   - Se **nem todas** têm grant → **não funde o sujeito nem o `TalentProfile` guest**. Copia (insert, não move) as observações da fonte reivindicada pro `TalentProfile` do usuário (provenance mantém o `cvSourceId` original, o que é factualmente correto — aquele dado realmente veio daquele CV). Grava `TalentSubjectMergeEvent(reason: CLAIM_PARTIAL_COPY)`. O `TalentProfile`/`TalentSubject` do guest continuam intactos; quando o usuário eventualmente reivindicar as fontes restantes, o passo se repete e converge pra fusão completa.
6. **Master, quando o claim faz este CV virar Master do usuário** — vira uma unidade durável completa, sem passos opcionais (fecha o ponto 4 da correção): dentro da mesma transação do claim,
   - cria/reutiliza `Resume` (ver passo 7);
   - cria a `CvMasterDesignation` do usuário apontando `cvStructuredProfileId` (fonte guest reivindicada via grant, ou fonte própria — ambas válidas, seção 7) — só se o usuário ainda não tiver Master ativo; se já tiver, a designação do guest fica preservada, superseded, sem ativar;
   - sincroniza `UserProfile` a partir do `CvStructuredProfile` (mesma rotina de merge da seção 5, chamada aqui em vez de esperar o próximo `CvProcessingJob`);
   - cria o `MonitorProjectionJob` durável (regra da seção 17 — aqui se aplica, pois é uma criação/substituição de Master);
   - registra a auditoria (`TalentSubjectMergeEvent` do passo 5, mais um evento de promoção referenciando o claim como origem);
   - **só conclui (marca o claim como bem-sucedido) depois que todos esses passos persistirem** — nunca deixa a designação de Master pendurada sem `UserProfile`/projeção correspondentes.
7. **Resume**: reusa um `Resume` existente do usuário que já aponte para um `CvSource` com o mesmo hash (ownership direto ou grant); senão cria um novo `Resume` + `CvSubmission(origin: CLAIM)` apontando **para a fonte à qual o usuário tem acesso válido** — a própria, se já possuía; a do guest, coberta pelo `ClaimSourceGrant`, se não possuía (nunca copia/realoca o `CvSource`).
8. **Projeção**: coberta dentro do passo 6 quando aplicável — não é um passo isolado.

Toda a sequência 1-8 roda em **uma única transação Prisma**. Não há passo de IA aqui (a extração já é `READY` de antes), então uma transação curta é segura e não bate no limite de Cloudflare.

**Chamar duas vezes o mesmo claim**: idempotente em cada passo (`create` protegido por `@@unique`/checagem prévia) — a segunda chamada não duplica nada e retorna o mesmo resultado final.

**Claim falha no meio**: por estar numa única transação, ou tudo commita ou nada commita — não existe "meio caminho" persistido, então retry é seguro e completo.

**Guest com várias análises**: cada análise é reivindicada com seu próprio token, numa chamada por análise (ou um endpoint em lote que roda os passos 1-4 por fonte e só reavalia o passo 5 uma vez ao final, pra não gerar merges parciais intermediários desnecessários dentro do mesmo lote).

### 4.3 Colisão de hash no claim — CvSource, extração e análises históricas nunca são realocados, nunca reapontadas

Se o usuário já possui um `CvSource` com o mesmo `textSha256` do CV do guest — e igualmente **quando não há colisão nenhuma** (ponto corrigido: `CvSource` nunca muda de dono, com ou sem colisão):

- **Preserva** o `CvSource` do guest (dono original inalterado), seu `CvStructuredProfile` (se `READY`) e qualquer análise histórica que aponte pra eles — nenhuma FK é reapontada, nenhuma extração é reexecutada.
- Cria só o `ClaimSourceGrant` (passo 2) — o usuário passa a ter acesso formal/legítimo àquela fonte sem "possuí-la" estruturalmente.
- **Reuso de extração sem nova IA** só acontece quando a regra de acesso permite: ownership direto **ou** `ClaimSourceGrant` válido apontando pro `cvSourceId` daquela extração — nunca por hash cru sem checar a permissão.
- **Qual fonte foi efetivamente usada em cada análise é preservado**: uma análise antiga do guest continua apontando pro `CvSource`/`CvStructuredProfile` do guest; uma análise nova do usuário que reusa o mesmo conteúdo aponta pro `CvSource` que o usuário efetivamente tem direito de usar (o próprio, se já existia; o do guest via grant, se não) — nunca os dois se confundem.
- Se havia colisão (usuário já possuía `CvSource` com o mesmo hash antes do claim): registra a equivalência entre as duas fontes via uma tabela leve, só para navegação/auditoria — não uma fusão:

```prisma
model CvSourceEquivalence {
  id              String   @id @default(cuid())
  primaryCvSourceId String  // o que o usuário já possuía
  equivalentCvSourceId String // o do guest, mesmo hash
  detectedAt      DateTime @default(now())

  @@unique([primaryCvSourceId, equivalentCvSourceId])
}
```

---

## 5. Rollback real (mantido da v1, sem mudança de mérito)

O núcleo de chamada de IA (`extractCanonicalProfile()`) vira um componente puro compartilhado por dois escritores durante a transição:
- **Legado**: continua escrevendo em `MasterCvCanonicalExtraction`, sob a flag atual — comportamento inalterado enquanto a flag estiver desligada.
- **Novo**: escreve em `CvStructuredProfile` via o worker da seção 1.

O legado só é congelado (parado de receber escrita nova) depois da janela de observação (seção 12) confirmar 100% de conformidade e uma decisão explícita de corte — nunca como efeito colateral de uma refatoração.

---

## 6. Modelo `CvSource` / `CvSubmission` / `Resume` — decisão fechada

**`CvSource` = conteúdo deduplicado, dentro do escopo do dono.** Não guarda metadado de envio.
**`CvSubmission` = ocorrência de ingestão** (o evento real: alguém mandou um arquivo, ou colou um texto, em um momento específico). Um `CvSource` pode ter N `CvSubmission` (mesmo conteúdo enviado mais de uma vez, por upload ou por texto colado).
**`Resume` = documento nomeado/gerenciável do usuário** (conceito que já existe, só authenticated). Aponta pra um `CvSource` (não mais 1:1) e, quando aplicável, pra a `CvSubmission` específica que o originou.

```prisma
enum CvSourceOwnerType {
  USER
  GUEST
}

model CvSource {
  id String @id @default(cuid())

  ownerType       CvSourceOwnerType
  userId          String?
  talentSubjectId String?

  textStorageKey String
  textSha256     String

  createdAt DateTime @default(now())

  user          User?          @relation(fields: [userId], references: [id], onDelete: Cascade)
  talentSubject TalentSubject? @relation(fields: [talentSubjectId], references: [id], onDelete: Cascade)

  submissions         CvSubmission[]
  resumes             Resume[]            // 1:N agora, não mais 1:1
  structuredProfiles  CvStructuredProfile[]
  profileSources      TalentProfileSource[]
  claimGrants         ClaimSourceGrant[]

  @@unique([userId, textSha256])
  @@unique([talentSubjectId, textSha256])
  @@index([userId])
  @@index([talentSubjectId])
}

enum CvSubmissionOrigin {
  FILE_UPLOAD
  PASTED_TEXT
  CLAIM // ocorrência formal criada só pelo claim (seção 4.2, passo 7), sem novo conteúdo real
}

model CvSubmission {
  id String @id @default(cuid())

  cvSourceId String
  cvSource   CvSource @relation(fields: [cvSourceId], references: [id], onDelete: Cascade)

  origin CvSubmissionOrigin

  // Só preenchido quando origin = FILE_UPLOAD:
  fileStorageKey String?
  fileSha256     String?
  fileName       String?
  mimeType       String?
  fileSizeBytes  Int?

  submittedAt DateTime @default(now())

  resume  Resume?  // a Resume que esta submissão originou, se houver
  analysisJobs AnalysisJob[]
  analysisCvSnapshots AnalysisCvSnapshot[]

  @@index([cvSourceId])
}
```

**Upload de PDF e texto colado com o mesmo `textSha256`**: compartilham o mesmo `CvSource` (mesmo conteúdo canônico), mas geram **duas `CvSubmission` distintas**, cada uma preservando seus próprios metadados reais (uma com `fileName/mimeType/fileStorageKey`, a outra sem). Nenhum metadado é "unionizado" ou sobrescrito.

**`Resume` (alterações aditivas)**:

```prisma
model Resume {
  // ...campos existentes inalterados...
  cvSourceId     String?           // FK simples, não mais @unique
  cvSubmissionId String?  @unique  // a ocorrência específica que originou este Resume
  cvSource       CvSource?     @relation(fields: [cvSourceId], references: [id], onDelete: SetNull)
  cvSubmission   CvSubmission? @relation(fields: [cvSubmissionId], references: [id], onDelete: SetNull)
}
```

Isso resolve de vez a contradição da v1: dois `Resume` do mesmo usuário com o mesmo conteúdo (dois envios distintos, mesmo hash) agora são possíveis — dois `CvSubmission` diferentes, mesmo `CvSource`, dois `Resume` diferentes.

`AnalysisCvSnapshot`/`AnalysisJob`/`CvAdaptation` ganham `cvSubmissionId` (qual ocorrência específica alimentou aquela análise) além do `cvStructuredProfileId` já previsto na v1 — mantendo a distinção entre "qual documento entrou" e "qual extração foi usada".

---

## 7. Integridade de propriedade no banco

CHECK constraints dentro da mesma tabela (Postgres puro, sem trigger):

```sql
ALTER TABLE "CvSource" ADD CONSTRAINT cv_source_owner_xor CHECK (
  ("ownerType" = 'USER' AND "userId" IS NOT NULL AND "talentSubjectId" IS NULL) OR
  ("ownerType" = 'GUEST' AND "talentSubjectId" IS NOT NULL AND "userId" IS NULL)
);

ALTER TABLE "CvMasterDesignation" ADD CONSTRAINT cv_master_designation_owner_xor CHECK (
  ("ownerType" = 'USER' AND "userId" IS NOT NULL AND "talentSubjectId" IS NULL) OR
  ("ownerType" = 'GUEST' AND "talentSubjectId" IS NOT NULL AND "userId" IS NULL)
);

ALTER TABLE "TalentProfile" ADD CONSTRAINT talent_profile_owner_xor CHECK (
  ("userId" IS NOT NULL AND "talentSubjectId" IS NULL) OR
  ("userId" IS NULL AND "talentSubjectId" IS NOT NULL)
);
```

Integridade **entre** tabelas (o Postgres não expressa `CHECK` multi-tabela — precisa de `CONSTRAINT TRIGGER` ou validação transacional explícita na aplicação; adotamos as duas, a trigger como última linha de defesa e a validação de serviço para dar erro amigável antes de chegar no banco):

```sql
-- Trigger: uma CvMasterDesignation de USUÁRIO pode apontar pra um
-- CvStructuredProfile cujo CvSource pertence DIRETAMENTE ao usuário, OU a
-- uma fonte guest para a qual o usuário possui um ClaimSourceGrant válido
-- (fecha o caso "Master vindo de CV reivindicado sem transferir o CvSource").
-- Uma designação de GUEST só pode apontar pra fonte do próprio talentSubject.
CREATE OR REPLACE FUNCTION check_master_designation_subject_match() RETURNS trigger AS $$
DECLARE
  source_owner_type "CvSourceOwnerType";
  source_user_id TEXT;
  source_subject_id TEXT;
  source_cv_id TEXT;
  has_grant BOOLEAN;
BEGIN
  SELECT cs."ownerType", cs."userId", cs."talentSubjectId", cs.id
    INTO source_owner_type, source_user_id, source_subject_id, source_cv_id
    FROM "CvStructuredProfile" sp
    JOIN "CvSource" cs ON cs.id = sp."cvSourceId"
    WHERE sp.id = NEW."cvStructuredProfileId";

  IF NEW."userId" IS NOT NULL THEN
    IF NEW."userId" = source_user_id THEN
      RETURN NEW; -- ownership direto
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM "ClaimSourceGrant" g
      WHERE g."cvSourceId" = source_cv_id AND g."userId" = NEW."userId"
    ) INTO has_grant;

    IF NOT has_grant THEN
      RAISE EXCEPTION 'CvMasterDesignation subject mismatch: user has neither ownership nor grant over the source';
    END IF;

    RETURN NEW; -- acesso via ClaimSourceGrant
  END IF;

  IF NEW."talentSubjectId" IS NOT NULL AND NEW."talentSubjectId" != source_subject_id THEN
    RAISE EXCEPTION 'CvMasterDesignation subject mismatch (guest subject)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_master_designation_subject_match
  AFTER INSERT OR UPDATE ON "CvMasterDesignation"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_master_designation_subject_match();
```

Além da trigger, o serviço de promoção de Master valida a mesma regra (ownership direto OU grant válido) ANTES do INSERT/UPDATE (mensagem de erro de negócio, não uma exceção crua de banco) — a trigger existe só como rede de segurança contra escrita direta/futura que esqueça de passar pelo serviço. **Testes negativos obrigatórios**: (a) inserir uma `CvMasterDesignation` de usuário sem ownership nem grant sobre a fonte deve falhar tanto via serviço quanto via INSERT direto; (b) inserir uma `CvMasterDesignation` de usuário com `ClaimSourceGrant` válido deve **passar** (prova que a trigger não é mais estritamente "mesmo dono").

---

## 8. Observação de formação (e demais fatos) — fingerprint, não campo nullable na unique

**Achado confirmado**: a correção da v1 (`institutionNormalized`/`degreeNormalized` nullable dentro de `@@unique`) tem um bug real do Postgres — `NULL` nunca é igual a `NULL` num índice único, então duas formações da mesma instituição com `degreeNormalized: null` **não colidem**, o `upsert()` não encontra a linha e a idempotência do backfill quebra silenciosamente (gera duplicata a cada execução).

**Correção**: identidade da observação por fingerprint determinístico, nunca por campo nullable cru.

```prisma
model TalentEducationObservation {
  id                String   @id @default(cuid())
  talentProfileId   String
  cvStructuredProfileId String
  itemFingerprint   String   // sha256(institution|degree|fieldOfStudy|period), campos ausentes viram string fixa "∅", nunca NULL
  itemIndex         Int      // posição do item na lista extraída, desempate para itens idênticos
  institutionRaw    String
  degreeRaw         String?
  fieldOfStudyRaw   String?
  periodRaw         String?
  observedAt        DateTime @default(now())

  talentProfile         TalentProfile         @relation(fields: [talentProfileId], references: [id], onDelete: Cascade)
  cvStructuredProfile    CvStructuredProfile   @relation(fields: [cvStructuredProfileId], references: [id], onDelete: Cascade)

  @@unique([talentProfileId, cvStructuredProfileId, itemFingerprint, itemIndex])
  @@index([talentProfileId])
}
```

- `itemFingerprint` é calculado sobre valores normalizados com um placeholder fixo (`"∅"`) no lugar de campo ausente — nunca `NULL` — então duas formações realmente idênticas (mesma instituição, mesmo curso ausente) diferenciam-se pelo `itemIndex` (posição na lista extraída daquele CV), preservando as duas.
- `cvStructuredProfileId` (em vez de `sourceRecordId` genérico) amarra a observação à extração exata, mantendo o vínculo formal já usado em outras partes do plano.
- **Backfill continua idempotente**: recalcular o mesmo fingerprint + mesmo índice pro mesmo `(talentProfileId, cvStructuredProfileId)` sempre resolve pra a mesma linha — rodar o backfill duas vezes não duplica.

Mesmo padrão aplicado a `TalentCompetencyObservation`/`TalentLanguageObservation`/`TalentCertificationObservation` (renomeando a chave da v1 de `valueNormalized` isolado para um `itemFingerprint` que inclui todos os atributos relevantes do fato — ex. competência inclui nível de proficiência no fingerprint, não só o nome normalizado).

---

## 9. Imutabilidade de `CvStructuredProfile` após `READY`

Depois que `status` vira `READY`, os campos `canonicalJson`, `coverageJson`, `confidenceJson`, `evidenceJson`, `extractorVersion`, `schemaVersion` e `cvSourceId` nunca são alterados. Uma nova versão de extrator ou uma nova tentativa gera **uma linha nova** (já garantido pela chave `@@unique([cvSourceId, extractorVersion, schemaVersion])` — mas isso só impede duplicata, não impede um `UPDATE` direto acidental).

Guarda em duas camadas:
1. **Repository/service**: o único método de escrita desses campos (`markReady()`) verifica `status atual != READY` antes de escrever; qualquer outra tentativa de `update()` nesses campos passa por um método explícito `assertMutable()` que lança erro se `status === READY`.
2. **Banco**: trigger simples que rejeita `UPDATE` desses campos quando `OLD.status = 'READY'`:

```sql
CREATE OR REPLACE FUNCTION reject_ready_profile_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'READY' AND (
    NEW."canonicalJson" IS DISTINCT FROM OLD."canonicalJson" OR
    NEW."coverageJson" IS DISTINCT FROM OLD."coverageJson" OR
    NEW."confidenceJson" IS DISTINCT FROM OLD."confidenceJson" OR
    NEW."evidenceJson" IS DISTINCT FROM OLD."evidenceJson" OR
    NEW."extractorVersion" IS DISTINCT FROM OLD."extractorVersion" OR
    NEW."schemaVersion" IS DISTINCT FROM OLD."schemaVersion" OR
    NEW."cvSourceId" IS DISTINCT FROM OLD."cvSourceId"
  ) THEN
    RAISE EXCEPTION 'CvStructuredProfile is immutable once READY';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reject_ready_profile_mutation
  BEFORE UPDATE ON "CvStructuredProfile"
  FOR EACH ROW EXECUTE FUNCTION reject_ready_profile_mutation();
```

**Teste obrigatório**: tentar um `UPDATE` direto (via SQL cru em teste, não via service) num `CvStructuredProfile READY` deve falhar com a exceção da trigger.

---

## 10. Semântica de promoções concorrentes — fechada, corrigida

Duas regras distintas e explícitas, nunca uma frase genérica como "primeira vence":

- **`PROMOTE_IF_FIRST`**: só se aplica quando **não existe** designação ativa para aquele dono. A primeira promoção que efetivamente conseguir criar a linha vence; **as seguintes não substituem** — mesmo que cheguem depois, elas encontram uma designação ativa e não fazem nada (viram no-op, não erro).
- **`PROMOTE_EXPLICIT`**: representa uma ordem explícita de substituição do usuário ("usar este CV como Master"). Quando duas chegam concorrentes pro mesmo dono, **a última a ser serializada pelo lock vence** — ou seja, a que conseguir o `SELECT ... FOR UPDATE` por último e commitar por último é a que fica valendo, porque semanticamente representa a decisão mais recente do usuário. A que perde não é descartada silenciosamente: sua designação chega a existir e é imediatamente superseded pela vencedora, preservando o histórico real de que ambas as intenções ocorreram.
- Em qualquer um dos dois casos: **somente uma `CvMasterDesignation` permanece ativa** ao final (`supersededAt IS NULL`), garantido pelo índice único parcial.
- O **polling** (`CvProcessingJob`/`AnalysisJob`/claim) sempre retorna qual `CvStructuredProfile` terminou efetivamente como Master — nunca assume que foi o próprio job que o chamador está observando; a resposta consulta a designação ativa no momento da leitura.

Mecanismo, dentro da transação curta de promoção:

```sql
SELECT * FROM "CvMasterDesignation"
WHERE ("userId" = $1 OR "talentSubjectId" = $2) AND "supersededAt" IS NULL
FOR UPDATE;
```

- **Quando não existe linha ativa** (caso "virar o primeiro Master", `PROMOTE_IF_FIRST`): o `FOR UPDATE` não tem o que travar — a defesa é o índice único parcial; a transação que perder a corrida do `INSERT` recebe violação de unicidade, faz `catch`, reconsulta a linha vencedora (mesmo idioma de `job-canonicalization.service.ts`) e retorna sucesso sem ativar nada (é um no-op correto, não um erro pro chamador).
- **Quando já existe linha ativa e a intenção é `PROMOTE_EXPLICIT`**: o `FOR UPDATE` serializa — a segunda transação espera a primeira commitar, então executa seu próprio `UPDATE supersededAt=now()` na linha que a primeira acabou de ativar, e insere a sua própria como nova ativa. Resultado determinístico: quem commita por último é quem fica ativo, sem exceção nem corrida de índice único (o índice só entra se as duas tentarem inserir a nova linha sem nenhuma existir ainda — ver caso anterior).
- **Quando já existe linha ativa e a intenção é `PROMOTE_IF_FIRST`**: a transação, ao ver uma linha ativa via `SELECT ... FOR UPDATE`, simplesmente não faz nada (no-op) — nunca supersede.

**Teste obrigatório com concorrência real de banco** (duas conexões Postgres simultâneas, não mocks):
- duas transações `PROMOTE_IF_FIRST` pro mesmo dono, nenhuma designação prévia → exatamente uma `CvMasterDesignation` ativa ao final, e o polling aponta pro `CvStructuredProfile` dela;
- duas transações `PROMOTE_EXPLICIT` pro mesmo dono, já com uma designação ativa prévia → a que commitar **por último** fica ativa, a outra fica superseded (não a que chegou primeiro), e o teste explicitamente controla a ordem de commit para provar isso (não pode ser um teste ambíguo sobre "quem chegou primeiro").

---

## 11. Consistência observável na resposta de polling

`GET /cv-processing-jobs/:id` só retorna `status: "READY"` quando **todas** as garantias abaixo são verdadeiras (verificadas no momento de marcar o job, seção 1 — o endpoint de leitura não recalcula, só reflete o que o worker já garantiu):

- `CvStructuredProfile.status = READY`;
- as observações da Base de Talentos para aquele `CvStructuredProfile` já foram persistidas (não apenas enfileiradas);
- se `masterIntent != NONE` **e** o Master de fato mudou nesta passada (seção 17): `CvMasterDesignation` válida existe, `Resume` (quando o dono é usuário) está marcado como Master, `UserProfile` já reflete o Master, e existe um `MonitorProjectionJob` persistido (não necessariamente executado);
- se `masterIntent == NONE` ou o Master não mudou: nenhuma dessas últimas quatro garantias se aplica — nenhum `MonitorProjectionJob` é exigido (seção 17).

`GET /analysis-jobs/:id` só retorna `status: "succeeded"` quando, além de tudo acima já valer para o `CvProcessingJob` do qual depende, `AnalysisJob.cvStructuredProfileId` aponta pro perfil correto e a análise foi executada com aquele conteúdo.

Nenhuma dessas garantias depende de um `Promise` solto sobrevivendo além da resposta HTTP original — todas são fatos já commitados no banco antes do `status` final ser escrito.

---

## 12. Migração em fases (revisada)

1. **Fase 0 — observabilidade, sem escrita.** Contagens/relatórios `--dry-run` (backfill, seção 13).
2. **Fase 1 — schema aditivo completo**: `CvSource`, `CvSubmission`, `CvStructuredProfile`, `CvMasterDesignation`, `TalentSubject`, `TalentSubjectSessionSignal`, `TalentProfileSource`, `TalentSubjectMergeEvent`, `ClaimSourceGrant`, `CvSourceEquivalence`, as observações com fingerprint, `MonitorProjectionJob`, todas as colunas aditivas em `Resume`/`AnalysisJob`/`CvAdaptation`/`AnalysisCvSnapshot`/`TalentProfile`, os CHECKs e triggers. Zero mudança de comportamento — nada lê/escreve nas tabelas novas ainda. Validada com 16 testes de integridade reais contra Postgres local (migration `20260904220951`).
   - **Corretiva 1a** (migration `20260904222812`, aplicada logo após a validação): `TalentProfile` ganhou `CHECK talent_profile_requires_owner ("userId" IS NOT NULL OR "talentSubjectId" IS NOT NULL) NOT VALID` — bloqueia `INSERT`/`UPDATE` novos sem dono a partir de agora, sem escanear (e sem quebrar) as 187 linhas legadas existentes sem dono algum. `VALIDATE CONSTRAINT` fica pendente para depois do backfill da Fase 4. `CvSource.talentSubjectId` mudou de `onDelete: Cascade` para `onDelete: Restrict` — um `TalentSubject` consolidado nunca é apagado por efeito colateral de outra exclusão; ele é marcado `mergedIntoUserId`/`mergedIntoTalentProfileId`/`mergedAt`, e uma exclusão integral por privacidade fica reservada a um fluxo próprio e auditado, ainda não implementado. Validada com 9 testes de integridade adicionais.
3. **Fase 2 — worker + orquestrador atrás de feature flag.** Caminho antigo (`mergeCanonicalProfileFromText`, chamadas diretas a `enqueueFromMasterResumeUpload`) continua no lugar, desligado por flag — reversível em minutos.
4. **Fase 3 — janela de observação em produção**, um ciclo de release inteiro, métricas de taxa de erro/latência de polling/custo de IA/tamanho da fila.
5. **Fase 4 — backfill do histórico** (seção 13), separado do deploy, com dry-run/checkpoint/métricas/rollback.
6. **Fase 5 — limpeza**: remove código legado só depois da Fase 3 confirmar conformidade total; torna a referência `cvStructuredProfileId` exigida via `CHECK` para linhas **novas** (`status != 'succeeded' OR cvStructuredProfileId IS NOT NULL`), nunca retroativo.

---

## 13. Plano de backfill (revisado, com as novas entidades)

Ordem de processamento, cada etapa com `--dry-run` padrão, checkpoint por lote, métricas e trilha de auditoria:

1. `MasterCvCanonicalExtraction(status: succeeded)` → `CvSource` + `CvSubmission(origin: FILE_UPLOAD, reconstruído a partir do Resume)` + `CvStructuredProfile(READY)`, sem nova chamada de IA.
2. `Resume.isMaster = true` → `CvMasterDesignation` (`promotedReason: FIRST_EVER`, aproximação documentada).
3. Análises antigas ligadas por hash (mesmo dono) ao `CvStructuredProfile` já criado no passo 1.
4. Análises sem extração aproveitável → reprocessamento real, em lotes pequenos.
5. **Sujeitos anônimos**: para cada `TalentProfile.userId IS NULL` existente hoje, cria um `TalentSubject` novo, vincula via `TalentSubjectSessionSignal` reconstruído a partir do `guestSessionHash`/`originSourceRecordId` já gravado, e reaponta `TalentProfile.talentSubjectId`.
6. **Observações**: semeia uma observação por fato consolidado atual (aproximação documentada — atribuída à última origem conhecida, já que o dado de qual CV disse primeiro já foi perdido pelo bug antigo). A partir daqui toda observação nova é fiel.
7. **Gap permanente documentado, não corrigido**: análises de visitante com texto já expirado/apagado do storage não são reprocessáveis — ficam sem `cvStructuredProfileId`, fora da obrigatoriedade da Fase 5 (que vale só para linhas novas).
8. **Claims históricos órfãos**: liga `TalentProfile.userId` onde os sinais de identidade já confirmam o dono, gerando `TalentSubjectMergeEvent(reason: MANUAL_ADMIN_REVIEW)` pra deixar rastreável que foi um backfill, não um claim em tempo real.

Execução: script único, `--dry-run`/`--limit`/checkpoint/`console.table` de métricas/log de auditoria — mesmo padrão dos scripts já existentes. **Não roda no mesmo deploy da migration de schema.** Rollback: como tudo é aditivo, apagar as linhas marcadas com `backfilledAt` reverte sem tocar nas tabelas originais.

---

## 14. Inventário de arquivos afetados (atualização da v1)

**Novos, além dos já listados na v1**:
- `apps/api/src/cv-structured-profile/cv-structured-profile.worker.ts` (substitui a ideia de orquestrador síncrono da v1)
- `apps/api/src/cv-structured-profile/monitor-projection.worker.ts`
- `apps/api/src/talent-subjects/talent-subject.service.ts`
- `apps/api/src/cv-adaptation/claim-source-grant.service.ts`

**Modificados, além dos já listados na v1**: todos os pontos de escrita direta de `Resume.cvSourceId`/análise que hoje assumiriam 1:1 precisam trocar `findUnique` por `findFirst`/lidar com múltiplos `Resume` por `CvSource`.

---

## 15. Checklist de testes (expandido)

Além de todos os já listados na v1:

- [ ] Duas `Resume` do mesmo usuário com o mesmo conteúdo (dois envios) coexistem, cada uma com sua própria `CvSubmission`.
- [ ] PDF e texto colado com hash igual compartilham `CvSource` mas preservam duas `CvSubmission` com metadados reais distintos.
- [ ] Claim de uma análise não transfere outras fontes da mesma sessão que não foram comprovadas nesta chamada.
- [ ] Claim parcial (`CLAIM_PARTIAL_COPY`) copia observações sem apagar/mover o `TalentProfile` do guest.
- [ ] Claim completo (todas as fontes do sujeito cobertas) funde o sujeito e grava `TalentSubjectMergeEvent(CLAIM_FULL)`.
- [ ] Colisão de hash no claim nunca reaponta `CvStructuredProfile`/análises históricas — só cria `ClaimSourceGrant` + `CvSourceEquivalence`.
- [ ] Chamar o mesmo claim duas vezes é no-op na segunda vez (idempotência ponta a ponta).
- [ ] `UPDATE` direto num `CvStructuredProfile READY` falha (trigger de imutabilidade).
- [ ] `INSERT` de `CvMasterDesignation` cruzando dono falha tanto no serviço quanto via SQL direto (trigger).
- [ ] Duas formações idênticas (mesma instituição, curso ausente) do mesmo CV sobrevivem via `itemIndex` no fingerprint.
- [ ] Backfill de observações roda duas vezes sem duplicar (idempotência do fingerprint).
- [ ] Duas promoções `PROMOTE_IF_FIRST` concorrentes (conexões reais de banco), nenhuma designação prévia, resultam em exatamente uma designação ativa (a primeira a commitar).
- [ ] Duas promoções `PROMOTE_EXPLICIT` concorrentes, com designação prévia já ativa, resultam na designação da transação que commitou **por último** ficando ativa (teste controla ordem de commit explicitamente).
- [ ] `CvProcessingJob` nunca vira `READY` com `MonitorProjectionJob` inexistente quando o Master de fato mudou nesta passada.
- [ ] `CvProcessingJob` com `masterIntent: NONE` nunca cria `MonitorProjectionJob`.
- [ ] Upload de Master sem análise cria só `CvProcessingJob`, nunca `AnalysisJob`.
- [ ] Retry de `CvProcessingJob` não cria um novo `AnalysisJob`; `AnalysisJob`s dependentes retomam sozinhos quando ele chega a `READY`.
- [ ] Retry de `AnalysisJob` não dispara nova extração quando `CvProcessingJob` já está `READY`.
- [ ] `GET /analysis-jobs/:id` reflete o estado do `CvProcessingJob` do qual depende sem duplicar/espelhar dados em outra tabela.
- [ ] `INSERT` de `CvMasterDesignation` de usuário com `ClaimSourceGrant` válido (sem ownership direto do `CvSource`) passa — prova que a trigger aceita acesso via grant.
- [ ] `INSERT` de `CvMasterDesignation` de usuário sem ownership nem grant falha, tanto no serviço quanto via SQL direto.
- [ ] Claim que faz um CV virar Master do usuário só conclui depois que `Resume`, `CvMasterDesignation`, `UserProfile` e `MonitorProjectionJob` estiverem todos persistidos (teste de integração que verifica a ausência de qualquer estado intermediário observável).
- [ ] Claim nunca transfere `CvSource.userId`/`talentSubjectId`, com ou sem colisão de hash — o dono original é sempre preservado, em qualquer cenário de claim.
- [ ] Nenhum `Promise` pós-resposta-HTTP é necessário para completar qualquer garantia da seção 11 (teste de integração que mata o processo logo após a resposta do entrypoint e confirma, via um processo novo, que o worker separado ainda completa o job).

---

## 16. Riscos e rollback (atualização da v1)

| Risco novo desta revisão | Mitigação |
|---|---|
| Polling adiciona complexidade de UX (usuário espera um status mudar) | Já é um padrão existente no produto (Monitor); reaproveitar componente de polling já usado lá |
| `TalentSubject`/`ClaimSourceGrant` aumentam o número de tabelas envolvidas num claim, mais superfície de bug | Toda a sequência do claim roda em uma única transação Prisma — atomicidade elimina estado parcial como classe de bug |
| Trigger de imutabilidade/subject-match pode ter falso positivo bloqueando escrita legítima | Testar em homolog com os fluxos completos antes do deploy; a trigger é `DEFERRABLE` onde aplicável, evitando falso positivo por ordem de escrita dentro da mesma transação |
| Fingerprint mal calculado (normalização inconsistente) gera duplicatas de observação | Função de normalização única e compartilhada, testada isoladamente com casos de acentuação/maiúsculas/abreviação antes de virar chave de dedup |

---

## 17. Restrição de criação do `MonitorProjectionJob` — fechada

`MonitorProjectionJob` é criado **somente** quando um dos gatilhos abaixo ocorre de fato (nunca "toda vez que um `CvProcessingJob`/`AnalysisJob` conclui"):

- Master foi **criado** (primeira designação ativa pra aquele dono);
- Master foi **substituído** (`PROMOTE_EXPLICIT` bem-sucedido, nova designação ativa diferente da anterior);
- Master foi **removido** (fluxo de exclusão, seção 6 da revisão anterior);
- ocorreu alteração manual relevante nas preferências monitoradas (`UserRadarProfile.updateProfile()` em campos que afetam matching — mecanismo já existente, mantido).

**Análise de CV não-Master (`masterIntent: NONE`) nunca cria `MonitorProjectionJob`** — mesmo que gere observações novas na Base de Talentos, isso não muda a projeção que o Monitor usa (`UserProfile`/`UserRadarProfile`), então não há rematching a disparar. Isso vale tanto para `CvProcessingJob` autônomo quanto para o passo 6 da seção 4.2 (claim) — a criação do job de projeção fica condicionada exclusivamente a "o Master mudou nesta transação", verificado por comparação explícita entre a designação ativa antes e depois, nunca por "este fluxo tocou em CV".
