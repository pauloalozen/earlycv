# Auditoria: pipeline de perfil canônico de CV (Master, Talento, Monitor)

**Data:** 2026-09-04
**Status:** auditoria concluída, nenhuma implementação feita ainda.
**Escopo:** por que CVs analisados não geram perfil estruturado de forma consistente, e o desenho de uma correção definitiva (sem implementar ainda).

Este documento responde, em ordem, às perguntas colocadas antes de qualquer implementação. Toda afirmação abaixo foi verificada em código real (arquivo:linha), não é suposição.

---

## 1. Fluxo atual (comprovado por código)

### 1.1 Todos os entrypoints que iniciam análise ou tocam o CV master

| Entrypoint | Auth | Extração completa (`MasterCvCanonicalExtractionService`) | Merge fraco por regex (`mergeCanonicalProfileFromText`) |
|---|---|---|---|
| `POST /resumes` → `ResumesService.create()` (resumes.service.ts:89) | logado | Sim, se `isMaster` (svc:213-240), *awaited* mas erro só logado | nunca |
| `PUT /resumes/:id` → `ResumesService.update()` (svc:286) | logado | **nunca** | nunca |
| `POST /resumes/:id/set-primary` → `setPrimary()` (svc:335) | logado | **nunca** | nunca |
| `DELETE /resumes/:id` → `remove()` (svc:400) | logado | n/a | n/a |
| `POST /cv-adaptation` → `create()` (cv-adaptation.service.ts:285) | logado | Sim, só se upload de arquivo virar master (svc:374-381) | **Sempre**, incondicional (svc:423) — roda junto com a extração boa quando vira master (redundante/race), e sozinho (fraco) quando reaproveita master existente |
| `POST /cv-adaptation/analyze` → `analyzeAuthenticated()` (svc:1642) | logado | Só dentro do branch de upload de arquivo que vira master (svc:1804-1841) | Só se `becameMaster` (svc:1925-1932) — pasted-text com `saveAsMaster:true` roda o merge fraco mas **nunca** a extração boa |
| `POST /cv-adaptation/claim-guest` → `claimGuest()` (svc:562) | logado | Só se não existir master ainda (svc:737-743) | nunca |
| `POST /cv-adaptation/analysis-jobs/:jobId/claim` → `claimGuestAnalysisJob()` (svc:1555) | logado | Delega pra `saveGuestPreview()` — herda o comportamento dela | idem |
| `POST /cv-adaptation/save-guest-preview` → `saveGuestPreview()` (svc:2312) | logado | 2 de 3 branches (arquivo vira master: svc:2402-2409; texto sem master: svc:2436-2440). Branch "já tem master" (svc:2410-2411): **nenhum dos dois** | nunca |
| `POST /cv-adaptation/analyze-guest` → `analyzeGuest()` (svc:774) | **visitante** | **nunca** — nenhuma referência a Resume/UserProfile/isMaster na função inteira | nunca |

**Padrão do vazamento, confirmado**: toda vez que a análise reaproveita um CV/texto que já existia (não cria um master novo), a extração boa é pulada. Guest nunca gera nada estruturado.

### 1.2 A análise nunca lê dado estruturado — hoje, em NENHUM caso

Achado mais importante da auditoria: **a chamada de IA que faz a análise/adaptação sempre recebe texto bruto**, mesmo quando a origem é o `UserProfile` já estruturado.

- `analyzeAuthenticated`/`analyzeGuest` resolvem `masterCvText` como string a partir de: texto colado, extração de PDF, `Resume.rawText`, ou — no `inputMode: "profile"` — `resolveProfileMasterCvText()` (cv-adaptation.service.ts:4772-4788), que lê o `UserProfile` estruturado e **o achata de volta em texto** via `renderCanonicalProfileToText()` (:4790-4841).
- Essa string vai direto pro prompt da IA em `packages/ai/src/cv-adaptation.ts:1264` (`wrapCvInput`). Só o lado da vaga é JSON estruturado; o lado do CV é sempre texto.
- `MasterCvCanonicalExtraction.canonicalJson` nunca é lido pelo prompt de análise — ele só alimenta `UserProfile` via merge, que depois é achatado de novo.
- `professionalProfileJson` (em `AnalysisCvSnapshot`) é **dado morto**: só uma função o escreve (`buildSnapshotProfessionalProfile`, cv-adaptation.service.ts:5283-5303, sempre `{version:"fallback_v1", textPreview, textLength, highlights}` — nunca dado categorizado) e **nada no código o lê**.
- **Não existe FK entre análise e extração estruturada.** A cadeia real é `AnalysisJob/CvAdaptation -> AnalysisCvSnapshot -> (nada)`. `MasterCvCanonicalExtraction.resumeId -> Resume` é uma cadeia paralela que nunca se cruza com a primeira. Uma análise pode terminar `succeeded` sem nenhuma extração estruturada por trás — de fato, é o caminho comum (guest, texto colado, upload avulso).
- **Restrição de schema que bloqueia o requisito 3 hoje**: `MasterCvCanonicalExtraction.resumeId` é **obrigatório** (schema.prisma:820, `onDelete: Cascade`). É estruturalmente impossível gerar uma extração canônica sem antes existir uma linha `Resume` — ou seja, visitante e "análise avulsa de texto colado" não têm hoje nenhum lugar pra guardar extração estruturada vinculada a `Resume`.

### 1.3 Ciclo de vida do Master — riscos reais encontrados

- **Deletar o master**: `ResumesService.remove()` (svc:400-423) apaga o `Resume` e, por cascade de schema, as linhas de `MasterCvCanonicalExtraction` daquele resume — mas **não toca em `UserProfile`/`UserRadarProfile`**, que não têm FK pra `Resume`. Resultado: dado órfão, sem nenhum registro de que a fonte sumiu. `UserRadarProfile.sourceResumeId` fica apontando pra um ID que não existe mais. **Não existe promoção automática de outro resume a master** (comentário explícito no código: "deletar um resume não resgata/promove outro a master").
- **Troca de master**: a troca do flag `isMaster` é atômica (dentro de `$transaction`, confirmado nos 5 call sites). **Mas a extração sempre roda DEPOIS do commit**, sem await real ou com erro engolido em try/catch que só loga. **Não existe rollback nem compensação**: um resume pode virar e permanecer master pra sempre com zero extração bem-sucedida atrás dele, de forma silenciosa.
- **Idempotência por hash não é graciosa**: `enqueueFromMasterResumeUpload` faz `create()` direto sem checar duplicata antes; uma segunda chamada com o mesmo conteúdo colide com `@@unique([resumeId, inputHash])`, lança erro Prisma P2002, que é **engolido** (só log) — nunca retorna a linha já existente. Não existe hoje uma query "última extração bem-sucedida deste resume" (as duas únicas leituras existentes são por `userId`, sem filtro de status).

### 1.4 Base de Talentos — o que existe de verdade (correção de um erro meu anterior)

Eu tinha dito antes que `TalentProfileCaptureService` só fazia extração de sinal de identidade por regex. **Isso estava errado.** Ela já roda enriquecimento de IA completo (mesma extração canônica, código duplicado em dois arquivos — `talent-profile-capture.service.ts` e `enrich-talent-profiles-ai.ts`, que precisam ser unificados pra não divergir).

Mas achei **dois bugs reais de perda de dado**:

- `TalentCompetency`, `TalentLanguageSkill`, `TalentCertification` têm `@@unique` **sem `sourceRecordId`** (ex.: `[talentProfileId, category, valueNormalized]`). O `upsert` sobrescreve `sourceRecordId`/`provenance` a cada chamada — se a pessoa analisar CV A e depois CV B, a skill "python" observada nos dois vira **uma linha só**, com a origem apontando pro último CV processado. **Não dá pra reconstruir fielmente o que um CV específico continha**, hoje, pra essas 3 tabelas.
- `TalentEducation` tem `@@unique([talentProfileId, sourceRecordType, sourceRecordId])` — sem discriminador de instituição/curso. Se o MESMO CV tem graduação + pós, o loop de upsert sobrescreve e **só a última entrada sobrevive** — perda de dado dentro do mesmo documento, não só entre documentos.
- `TalentExperience` é a única tabela satélite corretamente chaveada por `sourceRecordId` — reconstrução por documento funciona aí.
- **Dois sistemas de "claim" que não se falam**: o claim explícito de `CvAdaptation` (`claimGuest`/`claimGuestAnalysisJob`, transacional, por token de posse) e o "resolve" passivo do `TalentIdentityResolver` (só acontece na PRÓXIMA análise de alguém já logado, se os sinais de contato baterem com um perfil de visitante anterior). Eles nunca se comunicam — hoje é perfeitamente possível reivindicar uma análise de CV sem que o `TalentProfile` correspondente seja associado ao usuário.

### 1.5 `UserRadarProfile` mistura dado derivado com preferência — e tem 2 bugs

| Campo | Classificação | Observação |
|---|---|---|
| `areas`, `seniority`, `skills`, `languages`, `certifications` | Derivado do CV (ou override manual espelhado via `UserProfile`) | correto |
| `technologies` | **Morto** | nunca populado por nada além de `[]` hardcoded |
| `careerFingerprint` | Derivado, mas só existe na memória de uma extração recém-feita | nunca recomputado a partir do que já está salvo |
| `preferredWorkModels` | **Bug real**: híbrido — usuário pode setar manualmente via `updateProfile()`, mas `refresh()` (chamado fire-and-forget logo depois) **sobrescreve incondicionalmente** de volta pro que estiver em `UserProfile.remotePreference`, apagando silenciosamente o ajuste manual | precisa correção |
| `preferredContractTypes` | Preferência pura do usuário, corretamente nunca tocada por `refresh()` | seguro hoje |
| `openToRelocation`, `salaryExpectationMin` | **Mortos** — nenhum DTO os edita aqui; existe dado real e paralelo em `UserProfile.relocationPreference`/`targetSalaryMin/Max`, nunca sincronizado | inconsistência a resolver |
| `sourceResumeId`, `generatedAt`, `updatedAt` | Metadado/proveniência | — |
| `monitorStatus`, `matchFingerprint`, `lastMatchedAt` | Controle de staleness específico do Monitor (`computeMonitorMatchFingerprint`, exclui deliberadamente `preferredContractTypes`/`openToRelocation`/`salaryExpectationMin`/`certifications`/`careerFingerprint`/`sourceResumeId` do hash) | esses campos excluídos não têm rastreio de staleness nenhum |

### 1.6 Quem consome o quê — achado que simplifica o desenho

- **Motor de matching (Radar/Monitor)**: lê `UserRadarProfile` só por `userId`, **modelo de "um perfil por pessoa", sem dimensão de documento em lugar nenhum** (`matching.engine.ts`, `monitor-recommendations.service.ts`, `monitor-matching.worker.ts`, `public-jobs.controller.ts`, `saved-jobs.service.ts`). É o único lugar que precisa de uma projeção agregada "fatos do Master atual".
- **Carta de apresentação e prep de entrevista**: já são **inteiramente por documento** — leem o `CvAdaptation` específico da candidatura (`cover-letter.service.ts:214-231`, `interview-prep.service.ts:83-125`), nunca um perfil agregado. Nada a mudar aqui conceitualmente.
- **Geração da adaptação em si e a análise de fit**: leem `Resume.rawText` do resume específico sendo analisado/adaptado (cv-adaptation.service.ts:390-409) — também por documento, não agregado.

**Conclusão prática**: só o motor de matching precisa de uma projeção agregada por pessoa (o `UserRadarProfile`). O resto do produto já opera corretamente por documento — o desenho novo não precisa reescrever adaptação/carta/entrevista.

---

## 2. Respostas diretas às suas perguntas

- **Existe hoje entidade de extração completa e persistida de um CV específico?** Sim: `MasterCvCanonicalExtraction` (imutável, versionado por `inputHash`, um registro por upload/conteúdo). Mas exige `resumeId` obrigatório — não serve pra guest/texto avulso sem adaptação de schema.
- **O que `professionalProfileJson` contém?** Preview de texto bruto (`fallback_v1`), nunca dado categorizado. É escrito e nunca lido — dado morto.
- **`TalentExperience`/`TalentCompetency`/etc. reconstroem fielmente um CV filtrando por `sourceRecordId`?** Só `TalentExperience`. Os outros 3 (Competency/LanguageSkill/Certification) colapsam fatos de documentos diferentes na mesma linha (bug). `TalentEducation` colapsa até dentro do mesmo documento.
- **Esses registros são imutáveis ou podem ser alterados?** Sempre `upsert` — mutáveis, sobrescrevem `sourceRecordId`/proveniência a cada nova observação que bate na mesma chave.
- **Uma análise hoje referencia qual CV/snapshot foi usado?** Só até `AnalysisCvSnapshot` (texto bruto + hash). Nunca até uma extração estruturada — essa cadeia não existe.
- **`UserRadarProfile` mistura dado extraído com preferência manual?** Sim, na mesma tabela, com pelo menos 2 bugs de sobrescrita (ver 1.5).
- **Quais campos devem mudar quando o Master muda, quais devem ser preservados?** Devem mudar: `areas`/`seniority`/`skills`/`languages`/`certifications`/`careerFingerprint`/`sourceResumeId` (tudo derivado do CV). Devem ser preservados: `preferredContractTypes`, e — depois de corrigido — `preferredWorkModels`, `openToRelocation`, `salaryExpectationMin` (preferências declaradas, hoje mal implementadas mas conceitualmente do usuário).
- **Carta/entrevista/matching/adaptação precisam do documento específico ou do perfil acumulado?** Carta, entrevista e adaptação: documento específico (já é assim). Matching/Monitor: perfil agregado do Master atual (não o `TalentProfile` acumulado de múltiplos CVs).

---

## 3. A distinção que você exigiu — mapeada nas entidades reais

| Conceito | Entidade hoje | Situação |
|---|---|---|
| Perfil estruturado de UM CV específico | `MasterCvCanonicalExtraction` | existe, mas preso a `resumeId` obrigatório; sem análogo pra guest/texto avulso |
| Perfil profissional acumulado da pessoa | `TalentProfile` + satélites | existe, mas 2 bugs de colapso de dado (Competency/LanguageSkill/Certification, Education) |
| Perfil Master atual | `Resume.isMaster` + (nada estruturado formalmente ligado além do `UserProfile` achatado) | existe como flag, mas não referencia formalmente "a extração estruturada de qual CV" |
| Projeção usada pelo Monitor | `UserRadarProfile` | existe, mas mistura dado derivado com preferência do usuário na mesma tabela, com bugs de sobrescrita |

Nenhuma dessas 4 coisas precisa deixar de existir — a correção é: (a) garantir que toda extração vira um `CvStructuredProfile` versionado e independente de `resumeId` obrigatório, (b) corrigir as chaves do `TalentProfile` satélite pra não colapsar fatos entre documentos, (c) fazer o "Master" apontar formalmente pra UM `CvStructuredProfile` específico, (d) fazer o `UserRadarProfile` recalcular só a parte derivada a partir do Master, preservando a parte de preferência.

---

## 4. Fluxo proposto (final)

```
entrada de CV (arquivo, texto, guest ou logado)
        │
        ▼
hash do conteúdo (sha256) ──► já existe CvStructuredProfile válido pra esse hash?
        │                              │
        │ não                         sim
        ▼                              │
extração canônica completa             │
(experiências, competências,           │
formação, idiomas, certificações,      │
identidade — schema único)             │
        │                              │
        ▼                              ▼
        CvStructuredProfile (novo modelo — ver abaixo)
        │
        ├─► análise/adaptação/carta/entrevista consomem ESTE registro
        │   (nunca texto bruto direto)
        │
        ├─► se dono = usuário logado:
        │     upsert nas tabelas do perfil acumulado (TalentProfile/satélites,
        │     chaveadas corretamente por sourceRecordId)
        │     se não tem Master ainda → este vira o Master
        │     se já tem Master e não foi marcado "virar master" → NÃO substitui
        │     se marcado "virar master" → troca atômica (extração já validada
        │     ANTES da troca, nunca depois)
        │
        └─► se dono = visitante sem conta:
              mesma coisa, no MESMO TalentProfile (schema único), userId null
              (identityConfidence conforme sinais encontrados)
        
claim/criação de conta:
        localizar TalentProfile do visitante (por sinal de identidade OU por
        token de posse da análise — os dois mecanismos de claim PRECISAM
        conversar, hoje não conversam)
        → setar userId nele (sem reprocessar nada)
        → se usuário não tem Master, promover o CvStructuredProfile mais
          recente do visitante a Master
        → se já tem Master, não substituir

Master mudou (novo CV virou master, com sucesso confirmado):
        recalcular UserRadarProfile SÓ a partir do CvStructuredProfile do
        Master atual (nunca do TalentProfile acumulado de múltiplos CVs)
        preservar preferredContractTypes / preferredWorkModels /
        openToRelocation / salaryExpectationMin (não são derivados do CV)
```

Invariante de integridade (seu ponto 5), concretamente: `AnalysisJob`/`CvAdaptation` passam a ter `cvStructuredProfileId` obrigatório assim que concluídos com sucesso — não existe mais análise `succeeded` sem essa referência.

---

## 5. Estratégia de backfill retroativo

Duas populações distintas, tratadas separadamente:

1. **Quem já tem `MasterCvCanonicalExtraction` bem-sucedida** (hoje: usuários com `profileReadinessStatus: "ready"`, ~42 no seu banco local) — já corretos, nada a fazer.
2. **Quem tem CV real (master resume, análise concluída, ou registro de talento) mas não tem extração estruturada** — reprocessar via a MESMA função canônica nova, usando `Resume.rawText`/`AnalysisCvSnapshot` como fonte, gerando o `CvStructuredProfile` retroativamente. Isso é uma chamada de IA por pessoa/CV único (dedup por hash evita reprocessar o mesmo conteúdo duas vezes) — script incremental, `--dry-run` primeiro, com throttling.

O script de backfill que já existe (`backfill-radar-profiles.ts`) fica obsoleto nesse desenho — ele checava só `profileReadinessStatus`, que deixa de ser o critério certo uma vez que a extração pode rodar independente de virar master.

---

## 6. Duas opções

### Opção A — Evolução incremental (recomendada)

- Criar `CvStructuredProfile` como tabela NOVA (não uma migração destrutiva de `MasterCvCanonicalExtraction`) — pode até ser a própria `MasterCvCanonicalExtraction` com `resumeId` virando opcional e um `sourceType`/`sourceRecordId` genérico substituindo a obrigatoriedade de `Resume`.
- Uma função central (`ensureCvStructuredProfile({ ownerType: "user"|"guest", ownerId, content })`) chamada em TODOS os entrypoints do item 1.1 — substitui `mergeCanonicalProfileFromText` (que é deletado) e generaliza `enqueueFromMasterResumeUpload`.
- Corrigir as 2 chaves de upsert do `TalentProfile` satélite (`Competency`/`LanguageSkill`/`Certification` ganham `sourceRecordId` na chave OU um modelo de "fato observado" separado do "fato consolidado"; `TalentEducation` ganha discriminador).
- Ligar os dois mecanismos de claim (o explícito de `CvAdaptation` passa a também localizar/associar o `TalentProfile` correspondente).
- `UserRadarProfile.refresh()` passa a ler do `CvStructuredProfile` do Master (não de `UserProfile.skillsJson` recomputado ad hoc), preservando os campos de preferência (correção do bug de `preferredWorkModels`).
- Analysis/adaptação continuam recebendo texto no prompt da IA (não precisa reescrever o pipeline de IA), mas esse texto passa a ser **derivado do `CvStructuredProfile`** (via uma função de renderização única, tipo a já existente `renderCanonicalProfileToText`), garantindo que sempre existe extração por trás — não que o formato do prompt mude.
- **Risco**: médio. Não quebra consumidores existentes (carta, entrevista, adaptação continuam por documento). Maior risco é o motor de matching precisar de uma nova fonte de leitura — mitigável mantendo `UserRadarProfile` como está estruturalmente, só trocando de onde ele é alimentado.
- **Migração**: aditiva (nova tabela + novos FKs opcionais primeiro, backfill, depois tornar obrigatório).
- **Compatibilidade**: alta — nenhum consumidor externo muda de formato.
- **Testes**: unitários por entrypoint (todos os 10 do item 1.1) garantindo `cvStructuredProfileId` sempre presente pós-sucesso; testes de não-regressão pro fluxo de Master (delete/replace/flag); testes de idempotência (mesmo hash não reprocessa); teste de que reanalisar CV diferente não altera o Master sem o flag.

### Opção B — Substituição estrutural completa

- `TalentProfile` (+ satélites corrigidos) vira a ÚNICA fonte de verdade pra todo mundo, `UserProfile`/`UserRadarProfile` deixam de existir como tabelas independentes e viram views/projeções calculadas on-the-fly a partir de `TalentProfile` + um ponteiro de Master.
- **Risco**: alto. Toca matching engine, todos os DTOs de perfil/radar, admin, e qualquer lugar que hoje lê `UserProfile.skillsJson`/`UserRadarProfile.*` diretamente — superfície de mudança muito maior, incluindo o admin que acabei de construir (Alerta de Vagas/Monitor).
- **Migração**: não trivial — exige migrar todo histórico de `UserProfile`/`UserRadarProfile` pra linhas normalizadas, sem perder proveniência.
- **Compatibilidade**: baixa a curto prazo — muda o contrato de leitura em vários serviços simultaneamente.
- **Quando faz sentido**: só se a Base de Talentos for realmente virar o produto central (roadmap v3.2 já aponta nessa direção) — mas como uma migração posterior, não como parte desta correção.

**Minha recomendação**: Opção A agora (resolve os 5 invariantes que você listou, sem reescrever o que já funciona), com a unificação total (Opção B) documentada como direção de longo prazo pro v3.2, não bloqueando esta correção.

---

## 7. Testes necessários (checklist mínimo)

- [ ] Cada um dos 10 entrypoints do item 1.1 gera (ou reaproveita por hash) um `CvStructuredProfile` válido, nunca conclui sem um.
- [ ] Reanalisar com CV diferente sem flag não altera o Master.
- [ ] Reanalisar com CV diferente COM flag promove corretamente, só após extração validada.
- [ ] Falha na extração durante troca de master NÃO deixa o usuário sem master válido (rollback/compensação real, cobrindo o bug encontrado no item 1.3).
- [ ] Deletar o master não deixa `UserRadarProfile`/`UserProfile` órfãos silenciosamente — aplica a regra de limpeza definida.
- [ ] Mesmo conteúdo (hash igual) enviado 2x não gera 2 extrações nem lança erro pro usuário.
- [ ] Claim de visitante associa o `TalentProfile` E promove a Master (se ainda não tiver um) numa operação só, testável de ponta a ponta.
- [ ] `preferredWorkModels`/`preferredContractTypes`/`openToRelocation`/`salaryExpectationMin` sobrevivem a um `refresh()` disparado por um Master novo.
- [ ] Fatos de CVs diferentes não colapsam na mesma linha em `TalentCompetency`/`TalentLanguageSkill`/`TalentCertification`/`TalentEducation` (regressão dos 2 bugs encontrados).
- [ ] Matching (Radar/Monitor) usa só os dados do Master atual, nunca fatos acumulados de outro CV do mesmo usuário.
