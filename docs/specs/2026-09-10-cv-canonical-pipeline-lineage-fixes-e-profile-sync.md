# Sessão 2026-09-09/10 — correções de linhagem do pipeline canônico + sincronização UserProfile→Master

Contexto: testes manuais de Paulo no fluxo completo guest→cadastro→claim→troca de Master→liberação de CV, feitos em cima da correção de bugs de claim da sessão anterior (commit `23c532f`). Achou uma série de problemas reais em produção local (Postgres real, `earlycv_homolog`), corrigidos e commitados nesta sessão.

**Estado ao final:** tudo commitado (`5faa9bd`) e enviado pra `origin/develop`. Nada pendente de commit. Servidores locais (api + web) foram derrubados ao final da sessão — próxima sessão precisa subir de novo (`npm run dev` na raiz, ou os workspaces individualmente).

## 1. Bug recorrente: "lineage inconsistency" ao gerar/liberar CV (4 ocorrências, causa raiz corrigida)

**Sintoma:** `BadRequestException: Adaptation ... originated from a canonical-pipeline AnalysisJob (cvProcessingJobId set) but has no cvStructuredProfileId — lineage inconsistency, refusing to fall back to legacy text.` — apareceu 4 vezes em pontos diferentes do fluxo, cada vez travando a geração/liberação do CV pra sempre naquela adaptação.

**Causa raiz real (achada só na 4ª ocorrência):** `CvAdaptationService.saveGuestPreview` nunca resolvia a linhagem canônica (`cvStructuredProfileId`) sozinho — dependia de cada *chamador* passar isso manualmente. Só `claimGuestAnalysisJob` fazia essa busca. O endpoint público `POST /cv-adaptation/save-guest-preview` — usado pelo fluxo de **análise NOVA autenticada** (`apps/web/src/lib/authenticated-analysis-flow.ts`, apesar do nome enganoso "guest") — nunca passava esse valor. Resultado: toda análise autenticada que passasse pelo pipeline canônico virava uma `CvAdaptation` sem linhagem.

**Correção:** `saveGuestPreview` agora resolve sozinho, buscando o `AnalysisJob` dono do `analysisCvSnapshotId` recebido, sempre que o parâmetro não vier preenchido pelo chamador. Ver `cv-adaptation.service.ts`, dentro de `saveGuestPreview`, logo após a resolução do `snapshot` (`resolvedCvStructuredProfileId`).

**Ocorrências anteriores, também corrigidas no caminho (redundantes com a correção acima, mas mantidas por defesa em profundidade):**
- `saveGuestPreview` branch de idempotência (`existingAdaptation`) nunca fazia backfill do campo.
- `claimGuest()` (fluxo de claim com desbloqueio imediato, distinto de `claimGuestAnalysisJob`) nunca buscava/propagava o campo na criação.

**Teste de regressão:** `cv-adaptation.service.spec.ts` — `"saveGuestPreview auto-resolve cvStructuredProfileId a partir da AnalysisJob do snapshot, mesmo sem o caller passar"`. Mais os 2 achados anteriores também têm teste próprio.

**Segundo problema, sempre junto com esse bug:** a geração de CV entrava em loop infinito de retry a cada poll do frontend (3s), sem nunca informar erro nenhum ao usuário (só via timeout genérico de 8min). Corrigido com cooldown (só tenta regenerar uma vez, persiste `CvAdaptation.failureReason`) e um campo `error` explícito no payload de `GET /cv-adaptation/:id/content`, consumido pelo frontend (`adaptacao-cv-client.tsx`) pra parar de esperar na hora em vez de só depois de 8min.

**Se aparecer de novo:** antes de caçar um 5º caller, rodar esta query pra achar todos os registros afetados no banco:

```sql
SELECT ca.id, ca.status, aj."cvStructuredProfileId" AS job_profile
FROM "CvAdaptation" ca
JOIN "AnalysisJob" aj ON aj."convertedCvAdaptationId" = ca.id
WHERE aj."cvProcessingJobId" IS NOT NULL
  AND ca."cvStructuredProfileId" IS NULL
  AND aj."cvStructuredProfileId" IS NOT NULL;
```

Se aparecer alguma linha, é sinal de que ainda existe algum caminho que cria/atualiza `CvAdaptation` sem passar por `saveGuestPreview`/`claimGuest()` (os dois pontos já corrigidos). Backfill seguro (o valor certo já está na própria `AnalysisJob`):

```sql
UPDATE "CvAdaptation" ca
SET "cvStructuredProfileId" = aj."cvStructuredProfileId"
FROM "AnalysisJob" aj
WHERE aj."convertedCvAdaptationId" = ca.id
  AND aj."cvProcessingJobId" IS NOT NULL
  AND ca."cvStructuredProfileId" IS NULL
  AND aj."cvStructuredProfileId" IS NOT NULL;
```

## 2. Feature nova: `UserProfileMasterSyncService` — edições em `/meu-cv-master` passam a alimentar análises novas

**Problema original relatado por Paulo:** editar dados pessoais (nome/email/telefone) direto no sistema (`/meu-cv-master`) nunca refletia em análises/CVs gerados depois — o pipeline canônico só lia do `CvStructuredProfile` extraído do arquivo original, congelado pra sempre.

**Regra fechada com Paulo (importante, não violar):** análises/adaptações **já existentes** continuam usando SEMPRE a versão do CV que existia quando foram feitas — nunca refletem uma edição de perfil posterior, mesmo que o CV seja gerado/liberado depois da edição. Só análises **novas**, criadas depois da edição, usam o dado atualizado. Isso já é garantido estruturalmente: `CvStructuredProfile` é imutável após `READY` (trigger de banco), e `CvAdaptation.cvStructuredProfileId`/`AnalysisJob.cvStructuredProfileId` nunca são reescritos.

**Como funciona:** `apps/api/src/cv-processing/user-profile-master-sync.service.ts`, chamado só de `CvAdaptationService#resolveActiveMasterCvProcessingJobId` (início de uma análise nova sem conteúdo próprio). Sem IA — `UserProfile` já é estruturado, o mapeamento é puro (`apps/api/src/profiles/user-profile-canonical-mapper.ts`). Reusa toda a infra de versionamento já existente (`CvSource` dedup por hash, `CvStructuredProfile` append-only, `CvMasterDesignation` com supersede via `CvMasterPromotionService.promote()`).

**Dois achados de design corrigidos durante o próprio teste manual desta sessão** (documentados em comentário no código, mas resumindo aqui):
1. Só sincroniza quando existe pelo menos um campo com `source: "manual_edit"` em `UserProfile.profileFieldMetaJson` — sem isso, disparava na primeira análise nova depois de qualquer upload/claim, mesmo sem edição nenhuma do usuário.
2. Sempre reaproveita (`update`, nunca `create`) o **mesmo** `Resume` que já é o Master ativo — nunca cria um Resume novo com título genérico. Achado real: o nome do arquivo original sumia e virava "CV Master (sincronizado do perfil)", perdendo a rastreabilidade pro usuário.

**Migration nova (aditiva):** `20260909210802_profile_edit_sync_provenance` — `CvSubmissionOrigin.PROFILE_EDIT` e `CvMasterPromotionReason.PROFILE_EDIT_SYNC`. Já aplicada em `earlycv_homolog` e `earlycv_test` locais. **Não esquecer de aplicar em produção** quando essa branch for pra lá (Railway aplica `prisma migrate deploy` automaticamente no redeploy, `.railway-redeploy` já foi tocado e commitado).

**Badge visual:** card "CV Base" em `/meu-cv-master` mostra "Sincronizado com o perfil" quando o Master ativo veio dessa sincronização (`ResumeDto.syncedFromProfile`, calculado em `resumes.service.ts#list`).

## 3. Robustez contra servidor derrubado no meio do processamento

Achado testando de propósito (Paulo matou o servidor durante uma análise):

- **Backend já tinha recuperação automática** pra `CvProcessingJob`/`AnalysisJob` travados em `PROCESSING`/`processing` (10min de limiar, cron de 15s, claim atômico) — não precisou de código novo aqui, só confirmação de que funciona.
- **Frontend desistia antes do backend ter chance de se curar:** timeouts de polling (`analysis-job-polling.ts`, `adaptar/resultado/page.tsx`) estavam em 8min, abaixo do limiar de 10min do backend — corrigido pra 11min.
- **Tela de polling era um beco sem saída:** `/adaptar/resultado` durante `claimStatus === "waiting"` é um overlay `fixed inset:0` sem header nem navegação nenhuma. Se travasse, o usuário ficava preso (nem `/meu-perfil` no header ajudava — na verdade, `GuestAnalysisClaimer`, montado em `/meu-perfil`, redirecionava de volta pra essa mesma tela travada, por causa de uma marcação de claim pendente ainda não limpa no `sessionStorage`). Corrigido com um link de saída explícito na tela ("continuar navegando").

## 4. UX em `/meu-cv-master`

- Toast de confirmação ao salvar um bloco — canto inferior direito, barra de progresso de 3s (`save-toast.tsx`).
- Autosave ao fechar o bloco ou mover o foco pra fora dele (`onBlur` no form).
- Autosave ao remover um item inteiro (experiência/formação/skill/idioma/certificação) — achado: o botão de remover fica *dentro* do form, então o blur nunca disparava; agora cada `remove()` chama o autosave explicitamente.

## Onde retomar amanhã

- **Nada quebrado/pendente de código** — última correção (causa raiz do lineage bug) foi testada por specs automatizados, mas **ainda não confirmada visualmente por Paulo no navegador** desde o commit final. Primeira coisa a fazer: pedir pra ele repetir o teste de liberação de CV que estava falhando, confirmar que fechou de vez.
- Continuar os testes manuais do fluxo completo (guest→claim→trocas de Master→liberação) que estavam em andamento — Paulo estava no meio de uma bateria de testes quando esta sessão foi encerrada.
- Servidores locais precisam subir de novo (foram derrubados ao final da sessão, conforme convenção do projeto).
- Migration `20260909210802_profile_edit_sync_provenance` só está em `earlycv_homolog`/`earlycv_test` locais — vai pra produção só quando/se essa branch for deployada (Railway cuida disso sozinho no redeploy).
