# EarlyCV — Revisão técnica do diagnóstico: gate de autenticação para consumo do resultado da análise

## Status desta spec

Documento de planejamento técnico. **Não implementar nada a partir daqui sem aprovação posterior.** Não altera código, não cria migration, não muda analytics.

Este documento é uma **revisão** de `specs/no-guest-analysis-preview-auth-gate-diagnostic-plan.md` (diagnóstico anterior, mesma branch/commit). Não repete o que continua válido lá (mapa de arquivos genérico, schema, testes, maior parte dos edge cases) — corrige duas premissas erradas e substitui a recomendação arquitetural e tudo que dependia dela. Onde este documento e o anterior divergem, **vale este**.

Investigação de correção feita em 2026-08-24, mesma branch `develop`, commit `290222d`, relendo o código diretamente (não a spec `analytics-v2-saneamento-evolucao-plan.md`, que é histórica e não reflete necessariamente o estado atual do código).

---

## 1. Correções de premissa

### 1.1 A instrumentação de analytics já está implementada — o código é a fonte da verdade, não a spec histórica

Reli agora `apps/api/src/analysis-observability/business-funnel-event-ownership.ts` (77 linhas) e `analysis-event-version.registry.ts` (125 linhas) por completo, e `apps/api/src/posthog-integration/posthog-event-exporter.service.ts`. Confirmado:

- **Todos os 6 eventos citados no diagnóstico original já constam formalmente no registry, com ownership e versão definidos**: `analysis_started` (backend, v1), `analysis_completed` (backend, v1), `analysis_failed` (backend, v1), `analysis_result_viewed` (frontend, v1), `signup_completed` (backend, v1), `login_completed` (backend, v1). Não há nada "a implementar" nesses seis — já existem, já são exportados ao PostHog 1:1 pelo exporter, já têm enforcement de ownership em runtime.
- `analysis_started`/`completed`/`failed` já carregam `mode: "guest" | "authenticated"` (`cv-adaptation.service.ts:1178,1213` e branch de erro equivalente) — confirmado relendo o código agora, não mudou desde a primeira passada.
- `analysis_started` dispara **antes** dos gates de `AnalysisProtectionFacade` e antes da chamada de IA — dispara no exato momento em que `AnalysisJob.status` vira `"processing"` (`cv-adaptation.service.ts:1162-1183`), antes de `run()` ser chamado. Confirmado, sem mudança em relação à primeira passada.
- `analysis_result_viewed` dispara hoje **sem gate de autenticação**: a condição real (`resultado/page.tsx:2001-2008`) é `if (!rawData || (!isDemo && isAuthenticated === null)) return;` — ou seja, dispara assim que `isAuthenticated` é resolvido (`true` OU `false`), não só quando é `true`. Confirmado.
- `login_completed` (`auth.service.ts:154-190`) **não tem `idempotencyKey`** no `record()` — diferente de `signup_completed`, que tem (`idempotencyKey: signup_completed:${userId}`, linha 110). Confirmado, é um gap preexistente, não criado por esta mudança.
- `posthog.identify(userId)` (`posthog-auth-provider.tsx:278`) é chamado **sem segundo argumento de properties** — não há vínculo explícito código-a-código entre `distinct_id` e `earlycv_visitor_id`; o merge depende do comportamento default do SDK `posthog-js`. Confirmado, sem mudança.

**Duas descobertas novas nesta passada:**

- Existem documentos `apps/api/src/posthog-integration/EVENTS.md` e `DASHBOARDS.md` que **estão desatualizados em relação ao código** — citam eventos que não existem no registry atual (`landing_view`, `adapt_page_view`, `cv_upload_started`, `purchase_completed`) e **não mencionam** `analysis_completed`, `analysis_failed`, `analysis_result_viewed`, que já existem no registry. Ou seja, esses `.md` são o tipo de "doc divergente do código" que o próprio usuário pediu para eu ignorar como fonte — tratei `analysis-event-version.registry.ts` + `business-funnel-event-ownership.ts` + `posthog-event-exporter.service.ts` como única fonte de verdade, não esses markdowns.
- `full_analysis_viewed` existe no registry (backend, v1) mas **não encontrei nenhum lugar do código que o emita** — está registrado mas morto. Não é relevante para o gate, só registro para não confundir com `analysis_result_viewed`.

**Conclusão desta seção**: não há necessidade de propor, criar ou "coordenar" nenhum evento novo do funil `analysis_started → analysis_completed → analysis_result_viewed → signup_completed`. Toda a instrumentação pedida já existe, já funciona, já tem ownership/idempotência/versionamento corretos onde definidos. A única coisa que muda com o gate é **o momento em que `analysis_result_viewed` passa a ser alcançável** (só depois de autenticado) — não sua definição, nome, ownership ou payload.

### 1.2 Guest deve continuar executando análise — o gate é só de consumo, não de execução

O diagnóstico anterior recomendava desacoplar "persistir inputs" de "disparar `processAnalysisJob`", adiando o processamento para depois do login. Isso está descartado.

**Novo princípio, confirmado como compatível com o código atual**: guest continua podendo *executar* uma análise exatamente como hoje (`analyze-guest` cria `AnalysisCvSnapshot` + `AnalysisJob(ownerKind=guest)` e dispara `processAnalysisJob` imediatamente, do jeito que já funciona). O que muda é que **nenhuma superfície (página, endpoint, Server Action, storage local) pode entregar o conteúdo desse resultado a quem não está autenticado**. Isso é estritamente uma mudança de exposição/UI/ownership-check, não de pipeline de processamento.

---

## 2. Nova recomendação arquitetural

**Recomendo manter o pipeline guest exatamente como está hoje (processa imediatamente, sem esperar autenticação) e bloquear inteiramente a exposição do resultado a não autenticado.** Isto corresponde à "Opção 2" do diagnóstico anterior — que eu havia classificado como inferior por causa do custo de IA. Com a nova restrição de produto (preservar análises de não convertidos como ativo), essa característica deixa de ser uma desvantagem e passa a ser exatamente o comportamento desejado.

Por que, com base no código:

1. `analyze-guest` já persiste `AnalysisCvSnapshot` (texto + arquivo original em storage, TTL 30 dias) e `AnalysisJob` de forma completa e já dispara `processAnalysisJob` de forma imediata e assíncrona — isso já é "análise guest executada e preservada." Não precisa de nenhuma mudança de pipeline para atender ao requisito de preservação de análises de não convertidos.
2. Separar "persistir" de "disparar processamento" (o que eu recomendava antes) exigiria refatorar `startGuestAnalysisJob`/`processAnalysisJob` — mexendo em código crítico de produção que hoje passa por todos os gates de `AnalysisProtectionFacade`. Mantendo o pipeline como está, essa área inteira (rate-limit, turnstile, dedupe, usage policy, telemetria granular) **não precisa ser tocada**.
3. O trabalho real da mudança migra inteiramente para a camada de exposição: (a) parar de mostrar `/adaptar/resultado` para não autenticado, (b) parar de retornar conteúdo em qualquer endpoint de status/polling para não autenticado, (c) redirecionar para autenticação logo após o clique, (d) vincular a análise já processada (ou ainda processando) ao usuário assim que ele autentica, sem reprocessar.
4. Isso reduz a superfície de mudança de forma significativa em relação ao diagnóstico anterior — ver seção 5.

---

## 3. Fluxo guest revisado

```
/adaptar (page.tsx)
  → usuário preenche CV + vaga
  → clique em "Analisar meu currículo grátis" → dispara analyze_submit_clicked (inalterado)
  → handleSubmit, branch guest (MODIFICADO no comportamento de pós-submit, não no de disparo):
      → analyzeGuestCv() → POST /cv-adaptation/analyze-guest (INALTERADO no backend:
          cria AnalysisCvSnapshot + AnalysisJob(ownerKind=guest, status=pending) e chama
          processAnalysisJob imediatamente — analysis_started dispara aqui, como hoje)
      → resposta imediata do endpoint: { jobId } (cuid opaco, sem conteúdo)
      → frontend NÃO faz polling nem abre /adaptar/resultado para guest
      → frontend redireciona IMEDIATAMENTE para /entrar (com jobId propagado só
          via cookie httpOnly server-side — nunca em query string acessível a JS/URL
          visível, ver seção OAuth abaixo)

  Se o guest ABANDONA no login/cadastro:
      → AnalysisCvSnapshot permanece (guest, TTL 30 dias)
      → AnalysisJob permanece (ownerKind=guest, userId=null)
      → resultado computado (se processAnalysisJob já terminou) permanece em
          AnalysisJob.adaptedContentJson/previewText
      → nenhum signup_completed, nenhum User criado, nenhum claim
      → nenhum analysis_result_viewed jamais dispara para essa análise
      → dado disponível para uso interno (Base de Talentos/EarlySignal, analytics
          agregada) sob as mesmas regras de retenção que já existem hoje para
          AnalysisJob/AnalysisCvSnapshot (nenhuma delas muda)

  Se o guest COMPLETA autenticação (Google OAuth ou email/senha, novo ou existente):
      → signup_completed OU login_completed dispara normalmente (inalterado)
      → claim server-side vincula o AnalysisJob/AnalysisCvSnapshot ao userId
          SEM reprocessar (ver seção 6 — mecanismo exato)
      → frontend é levado para /adaptar/resultado (ou uma tela de espera se o
          job ainda estiver "processing")
      → se ainda processando: polling autenticado, ownership já garantida pelo
          claim (getAnalysisJobStatus já sabe checar job.userId === request.userId,
          sem mudança nesse endpoint)
      → quando succeeded: resultado renderiza — reaproveitando o estado
          "autenticado mas não pago" (`is_locked`) que JÁ EXISTE hoje em
          resultado/page.tsx para usuários autenticados sem crédito — não é
          preciso construir nenhuma UI nova de bloqueio, só impedir que o
          branch de guest exista
      → analysis_result_viewed dispara, agora sempre com mode: "authenticated"
```

---

## 4. Fluxo authenticated

**Inalterado.** `POST /cv-adaptation/analyze` (guarda `JwtAuthGuard`), `startAuthenticatedAnalysisJob`, `processAnalysisJob(mode: "authenticated")`, resultado sempre em `CvAdaptation` vinculada a `userId`. Nenhuma mudança de comportamento, código ou analytics para quem já está logado ao clicar em "Analisar".

---

## 5. Mudanças mínimas necessárias

| Arquivo | Comportamento atual | Mudança realmente necessária |
|---|---|---|
| `apps/web/src/app/adaptar/page.tsx` | Branch guest chama `analyzeGuestCv`, guarda resultado completo em storage após polling, deixa usuário na própria página vendo progresso | Branch guest chama `analyzeGuestCv` (igual), mas ao receber `{ jobId }` redireciona IMEDIATAMENTE para `/entrar` (sem polling no frontend guest, sem gravar resultado em storage) |
| `apps/web/src/app/adaptar/resultado/page.tsx` | Branch `!isAuthenticated` renderiza `GuestBlurOverlay` + mocks | **Remover só o branch de guest.** O branch "autenticado + `is_locked`" já existe e não muda — é reaproveitado como está |
| `apps/web/src/lib/guest-analysis-storage.ts` | Guarda resultado completo (`adaptedContentJson`, `previewText` etc.) em `sessionStorage`+`localStorage` | **Obsoleto por completo.** Não há mais razão para o browser guardar conteúdo de análise — o resultado nunca chega ao browser antes da autenticação |
| `apps/web/src/app/dashboard/guest-analysis-claimer.tsx` | Lê `guestAnalysis` do storage, chama `saveGuestPreview` com conteúdo completo | Muda de fonte: não lê mais storage de conteúdo (que deixa de existir); vira fallback client-side que apenas confirma se há um claim pendente a finalizar, chamando a nova variante de claim por `jobId` (ver seção 6) |
| `apps/api/src/cv-adaptation/cv-adaptation-public.controller.ts` (`analyze-guest`) | Cria snapshot+job, dispara processamento, retorna `jobId` | **Sem mudança de lógica** — já retorna exatamente o que é preciso (`jobId`) |
| `apps/api/src/cv-adaptation/cv-adaptation-public.controller.ts` (`GET analysis-jobs/:jobId`, polling) | Sem guard, ownership manual (`job.userId` ou `guestSessionHash` — ver nota de segurança abaixo), retorna conteúdo se autorizado | Para chamada NÃO autenticada: **nunca** retornar `adaptedContentJson`/`previewText` — no máximo `{ status: "pending"\|"processing"\|"succeeded"\|"failed" }`. Avaliar se guest precisa saber `succeeded` antes de autenticar — ver seção 9 |
| `apps/api/src/cv-adaptation/cv-adaptation.service.ts` (`startGuestAnalysisJob`, `processAnalysisJob`) | — | **Sem mudança.** Confirmado que não é preciso desacoplar nada aqui |
| `apps/api/src/cv-adaptation/cv-adaptation.service.ts` (`saveGuestPreview`) | Recebe `adaptedContentJson`/`previewText`/`masterCvText` **do corpo da requisição** (cliente já tinha visto o resultado) | Precisa de uma variante nova que busque esses campos **do próprio `AnalysisJob` no servidor**, por `jobId`, em vez de exigir que o cliente reenvie o payload — porque agora o cliente/browser nunca teve acesso a esse conteúdo (ver seção 6) |
| `apps/api/src/auth/oauth-signup-context.ts` | 3 cookies httpOnly (`ctx`,`sid`,`vid`), path `/api/auth/google`, 10 min | Adicionar um 4º no mesmo padrão: `oauth_guest_analysis_job_id` (cuid do `AnalysisJob`, nunca conteúdo) |
| `apps/api/src/auth/auth.controller.ts` (`googleCallback`) | Lê/limpa os 3 cookies, chama `finishSocialLogin`, redireciona com tokens na URL | Lê/limpa também o 4º cookie; se presente, inclui `analysisJobId` como query param adicional no redirect para `/auth/social-callback` (mesmo nível de exposição que os tokens já expostos ali — ver seção 9) |
| `apps/web/src/app/auth/social-callback/route.ts` | Valida tokens, grava cookies de app, lê `post_auth_next` | Se `analysisJobId` presente na query, chama server-side (com o JWT recém-emitido) o novo endpoint de claim-por-jobId, ANTES de redirecionar o browser — mantém o `jobId` inteiramente server-side, nunca em JS do cliente |
| `apps/web/src/app/entrar/google-auth-button.tsx` | Acrescenta `sid`/`vid` como query params, cookie `post_auth_next` | Sem necessidade de mudança se o `jobId` for propagado via cookie httpOnly gravado pelo backend no clique de "Analisar" (ver seção OAuth) |

**Redução de escopo em relação ao diagnóstico anterior**: a coluna "banco de dados" praticamente desaparece (nenhuma migration identificada como necessária — ver seção 8), o módulo `analysis-protection`/`AnalysisProtectionFacade` sai inteiro da lista de arquivos tocados, e a UI de resultado ganha uma remoção (branch guest) em vez de uma reconstrução.

---

## 6. Claim sem reprocessamento

Mapeei os três mecanismos existentes com precisão:

- **`claimGuestAnalysis` / `POST /cv-adaptation/claim-guest` (`claimGuest` em `cv-adaptation.service.ts:549-756`)**: NÃO é o mecanismo certo para este fluxo. Essa rota **exige crédito** (`user.creditsRemaining < 1` lança erro, salvo `superadmin`) — é o fluxo de "resgatar/desbloquear com crédito", usado hoje só em `handleUseCredit` no frontend. Confundir isso com "vincular análise guest à conta recém-criada" seria errado — são features diferentes.
- **`saveGuestPreview` (`cv-adaptation.service.ts:2063-2292`)**: este é o mecanismo certo — cria uma `CvAdaptation` vinculada ao `userId`, **sem** consumir crédito (`status: "pending", paymentStatus: "none"`, sem `isUnlocked: true`), ou seja, cria exatamente o mesmo tipo de registro "autenticado, aguardando pagamento" que uma análise autenticada normal geraria. É idempotente por natureza: antes de criar, verifica `existingAdaptation` por `userId + analysisCvSnapshotId` (linha 2185-2201) e, se já existir, só atualiza o vínculo com `JobApplication` em vez de duplicar.
- **`validateAndClaimSnapshot` (`cv-adaptation.service.ts:5086-5154`)**: usado por ambos os métodos acima. É o boundary real de dedupe/ownership — marca `claimedByUserId` na `AnalysisCvSnapshot`, rejeita se já reclamado por outro usuário, rejeita se expirado, rejeita mismatch de hash de sessão quando presente.

**Problema real identificado nesta revisão**: `saveGuestPreview` espera receber `adaptedContentJson`/`previewText`/`masterCvText`/`jobDescriptionText` **no corpo da requisição**, porque hoje é sempre chamado por um browser que já tinha visto/guardado esse conteúdo (via `guestAnalysis` em `localStorage`). Na nova arquitetura, o browser **nunca** tem esse conteúdo antes da autenticação — então `saveGuestPreview` como está hoje não serve diretamente.

**Mudança mínima necessária**: uma variante de `saveGuestPreview` que resolve `adaptedContentJson`/`previewText`/`masterCvText`/`jobDescriptionText`/`jobTitle`/`companyName` **lendo diretamente do `AnalysisJob` no servidor** (por `jobId`), em vez de aceitar esses campos do cliente — o `AnalysisJob` já tem todos esses campos como colunas (`adaptedContentJson`, `previewText`, `masterCvText`, `jobTitle`, `companyName`, `analysisCvSnapshotId`, confirmados no schema). O resto da lógica (resolução de master CV, criação de `CvAdaptation`, `validateAndClaimSnapshot`, `markAnalysisJobConverted`, hook de `JobApplication`) é reaproveitado sem alteração — só muda a **fonte** dos dados de entrada, de "corpo da requisição" para "linha do `AnalysisJob`".

Isso garante, por construção, que **nenhuma chamada de IA nova acontece no claim** — o conteúdo usado é sempre o que `processAnalysisJob` já calculou e gravou.

**E se o job ainda estiver `processing` no momento do login?** Recomendo separar em dois passos, não forçar tudo dentro do callback OAuth:
1. No callback (ou em `/auth/social-callback/route.ts`, server-side), fazer só a "transferência de posse" do `AnalysisJob` — set `AnalysisJob.userId = <novo user>` (hoje `null` para guest) de forma idempotente. Isso já é suficiente para que `getAnalysisJobStatus` (que já checa `job.userId === request.userId`) libere o polling autenticado **sem nenhuma mudança nesse endpoint**.
2. Quando o frontend (autenticado, via polling normal) vir `status: "succeeded"`, dispara a variante de `saveGuestPreview`-por-jobId descrita acima, que materializa a `CvAdaptation`. Se o job já tivesse terminado antes do login, esse passo roda imediatamente após o passo 1, sem espera perceptível.

Isso evita ter que lidar com timing de IA dentro do handler síncrono do callback OAuth, e reaproveita 100% do polling e das checagens de ownership que já existem.

---

## 7. Analytics atual (auditoria do código já implementado)

Ver seção 1.1 para a auditoria completa. Resumo aplicado ao gate:

| Conceito pedido pelo usuário | Evento já existente | Muda algo com o gate? |
|---|---|---|
| analysis intent | `analyze_submit_clicked` (frontend) | Não. Continua disparando no clique, guest ou autenticado, antes de qualquer chamada ao backend |
| analysis execution | `analysis_started` / `analysis_completed` / `analysis_failed` (backend) | Não. Continuam dispatchando exatamente como hoje, incluindo para `mode: guest` — o gate não interfere no pipeline de processamento |
| analysis consumption | `analysis_result_viewed` (frontend) | Só o **alcance** muda: como `/adaptar/resultado` deixa de renderizar para não autenticado, esse evento passa a só ocorrer com `mode: "authenticated"` — **consequência estrutural de remover o branch guest da página, não uma mudança na lógica do próprio evento** |
| Conta criada | `signup_completed` (backend, idempotente por `userId`) | Não muda |
| Login em conta existente | `login_completed` (backend, sem idempotencyKey — gap preexistente) | Não muda; não é objeto desta mudança corrigir isso |

Métricas pedidas pelo usuário (`análises executadas vs. resultados vistos vs. cadastros`, `analysis_completed → signup_completed`) são **totalmente computáveis com os eventos já existentes**, cruzando por `visitor_id`/`sessionInternalId`, que já viajam em `analysis_started`/`analysis_completed` (via `buildAnalysisJourneyMetadata`) e em `signup_completed`. **Não é necessário nenhum evento novo.**

---

## 8. Persistência dos não convertidos

Confirmando explicitamente:

- **`AnalysisCvSnapshot`** (guest, `userId: null`): permanece com `expiresAt = criadoEm + 30 dias` (`cv-adaptation.service.ts:5050-5052`, confirmado nesta revisão) — inclui texto do CV e arquivo original em storage. Isso é a política de retenção **já existente hoje**, não criada por esta mudança.
- **`AnalysisJob`** (guest, `ownerKind: "guest"`, `userId: null`): segundo o comentário do próprio schema (linhas 937-947, citado no diagnóstico anterior), é **retido permanentemente** desde decisão de produto de 2026-07-18 — inclusive guests que nunca convertem. Nada nesta mudança altera essa retenção.
- **Resultado calculado** (`AnalysisJob.adaptedContentJson`/`previewText`): vive dentro do próprio `AnalysisJob`, então segue a mesma retenção permanente dele.
- **`visitor_id`/`journeySessionInternalId`/`conversion_context`**: continuam sendo gravados como metadata dos eventos `analysis_started`/`analysis_completed` (`buildAnalysisJourneyMetadata`) independentemente de conversão — nenhuma mudança.

Se o guest **converte** depois: `AnalysisJob.userId` passa a apontar para o novo usuário (passo 1 da seção 6), e uma `CvAdaptation` é criada a partir do conteúdo já calculado (passo 2) — sem apagar o `AnalysisJob`/`AnalysisCvSnapshot` originais, que continuam existindo como registro de origem (`AnalysisJob.convertedAt`/`convertedCvAdaptationId` já existem no schema exatamente para marcar essa transição, sem duplicar dado).

Se o guest **não converte**: nada muda em relação ao comportamento atual — permanece exatamente com a retenção de hoje.

**Nenhuma migration identificada como necessária** para este ponto — os campos que a nova arquitetura usa (`userId` nullable em `AnalysisJob`, `convertedAt`/`convertedCvAdaptationId`, todos os campos de conteúdo) já existem.

---

## 9. Segurança

Ponto central do usuário, reafirmado: **existir no backend não dá direito de consulta a guest.**

Superfícies revisadas:

- **Polling público** (`GET /cv-adaptation/analysis-jobs/:jobId`, sem guard): hoje devolve conteúdo se a checagem de ownership (via `userId` ou `guestSessionHash`) passar — e **inclui um caso frouxo**: quando o job não tem nem `userId` nem `guestSessionHash` setados, o código atual marca `isOwner = true` (achado do diagnóstico anterior, ainda válido, não recoberto nesta revisão porque o mecanismo de sessão não mudou). Isso precisa ser fechado **antes** de remover a proteção visual da UI, porque hoje esse caso "raro" já existe e a única coisa que hoje o mascara é a UI nunca pedir esse dado sem querer.
- **Achado novo desta revisão sobre `guestSessionHash`**: o `guestSessionPublicToken`/cookie `analysis_session_token` que o backend lê (`request-context.middleware.ts:12-15,335`) **nunca é setado como cookie em nenhum lugar do código** (busquei em toda a `apps/api/src` — só esse arquivo referencia esse nome, e só para leitura). Ou seja, `analysisContext.sessionPublicToken` é **sempre `null`** hoje em produção, e por consequência `AnalysisJob.guestSessionHash`/`AnalysisCvSnapshot.guestSessionHash` também ficam **sempre `null`** para guests atualmente (confirmado: `hashGuestSessionToken(analysisContext?.sessionPublicToken)` recebe sempre `undefined`/`null`). Isso corrige uma suposição do diagnóstico anterior — eu tinha implicitamente assumido que esse token já funcionava como "sessão do guest" propagável. **Não funciona assim hoje.** A proteção real de posse de uma análise guest hoje depende de: (a) o `id` do `AnalysisJob`/`AnalysisCvSnapshot` ser um cuid não-adivinhável, e (b) — no fluxo antigo de `saveGuestPreview` — o cliente ter que reenviar o conteúdo inteiro (que só quem viu o resultado teria). Na nova arquitetura, o item (b) desaparece (browser nunca vê o conteúdo), então a posse passa a depender **inteiramente** de (a) — o `jobId` sendo tratado como segredo (nunca em URL visível/JS do cliente, sempre em cookie httpOnly e em chamadas server-to-server) — reforça por que a seção 6/OAuth recomenda mantê-lo fora do alcance de JavaScript do browser.
- **Página `/adaptar/resultado`**: precisa negar renderização (idealmente com checagem no servidor/middleware Next, não só `useEffect` client-side) para não autenticado — um `useEffect` que decide depois de montar corre risco de um "flash" de estrutura da página antes do redirect. Recomendo checagem de sessão o mais cedo possível no ciclo de vida da página (Server Component/middleware), não só client-side.
- **`Server Actions`/API**: qualquer action que hoje aceite `adaptedContentJson` vindo do cliente para persistir (`saveGuestPreview` atual) deixa de ser o caminho usado no fluco de claim automático — a nova variante lê do servidor, fechando a possibilidade de alguém forjar `adaptedContentJson` arbitrário no claim.
- **Guest realmente precisa saber `succeeded` antes de autenticar?** Recomendo que sim, só o status (não o conteúdo) — para a UX de espera funcionar bem (ex.: mostrar "sua análise já terminou, é só entrar" antes mesmo do clique em auth) é preciso pelo menos `pending|processing|succeeded|failed`, sem detalhe nenhum do resultado. Isso é seguro desde que a checagem de ownership feche a brecha do "isOwner = true sem userId nem hash" mencionada acima.

---

## 10. Edge cases (reavaliados)

| Caso | Comportamento esperado (revisado) |
|---|---|
| OAuth cancelado | `AnalysisJob`/`AnalysisCvSnapshot` guest permanecem intactos, disponíveis para retry de login mais tarde (mesmo `jobId`, se o cookie httpOnly ainda não expirou; senão, análise fica órfã mas preservada — usuário perde só a referência, não o dado) |
| Signup por email | Mesmo fluxo de claim, só troca o método de autenticação — o passo 1/2 da seção 6 não depende de Google especificamente, só de "usuário autenticado" |
| Login em conta existente | Idêntico — `login_completed` em vez de `signup_completed`, claim roda igual |
| Google OAuth | Fluxo principal descrito na seção 3 |
| Duas abas (aba A → análise A, aba B → análise B, aba A completa login) | Risco real, herdado do padrão atual de cookies OAuth globais (mesmo problema já documentado para `sid`/`vid`/`ctx`). Como agora existe uma análise concreta em jogo (não só contexto de analytics), a mitigação mínima recomendada é: o cookie `oauth_guest_analysis_job_id` deve ser sobrescrito **a cada novo clique em "Analisar"**, então "a última aba que clicou Analisar antes do login" é a que vence — isso é previsível mesmo que não seja perfeito. Se o Paulo quiser proteção mais forte, a alternativa é abrir o OAuth já com o `jobId` resolvido num token assinado de curta duração incluído na própria URL de `/entrar` (não no cookie global) — mas isso reintroduz exposição em URL. Recomendo aceitar a limitação (documentada) como está, igual já é aceita hoje para `sid`/`vid` |
| Duplo clique em "Analisar" | Mesma proteção que já existe hoje (dedupe lock por `canonicalHash` em `AnalysisProtectionFacade`) — sem mudança |
| Callback OAuth duplicado | `finishSocialLogin` já é idempotente (upsert por `providerAccountId`/email); "transferência de posse" do `AnalysisJob` (passo 1, seção 6) deve ser escrita de forma idempotente (`update` incondicional de `userId`, não um "create") — nenhuma duplicação de dado |
| Claim duplicado | `validateAndClaimSnapshot` já rejeita reclamar um snapshot já `claimedByUserId` de outro usuário; a nova variante de `saveGuestPreview`-por-jobId herda essa proteção porque continua chamando o mesmo `validateAndClaimSnapshot` |
| Refresh antes do login | `AnalysisJob` já existe no backend desde o clique em "Analisar" — um refresh não perde a análise (diferente do diagnóstico anterior, que dependia de o browser guardar o resultado). Só perde a referência (`jobId`) **se** o cookie/estado local que aponta pra ele também for perdido — recomendo persistir o `jobId` (não o conteúdo) num cookie de app de vida mais longa, não só no cookie de 10 min do hop OAuth |

---

## 11. Plano de implementação revisado

**Fase 0 — Baseline**: rodar suíte relacionada (listada no diagnóstico anterior) antes de qualquer mudança.

**Fase 1 — Fechar a brecha de segurança preexistente**: corrigir `getAnalysisJobStatus` para nunca retornar `isOwner = true` no caso sem `userId` nem `guestSessionHash`, e restringir o payload da rota de polling pública a status apenas (nunca conteúdo). Isso é independente do resto e pode subir sozinho.

**Fase 2 — Frontend: parar de expor resultado a guest**: alterar `handleSubmit` em `/adaptar` para redirecionar direto para `/entrar` após receber `jobId`; remover branch guest de `/adaptar/resultado`; tornar obsoleto `guest-analysis-storage.ts`. Atrás de flag.

**Fase 3 — OAuth: 4º cookie + transferência de posse**: adicionar `oauth_guest_analysis_job_id` ao padrão existente; no callback (ou em `social-callback/route.ts`), setar `AnalysisJob.userId` de forma idempotente.

**Fase 4 — Backend: claim-por-jobId**: nova variante de `saveGuestPreview` que lê conteúdo do `AnalysisJob` em vez do corpo da requisição; frontend autenticado chama isso quando o polling mostrar `succeeded`.

**Fase 5 — Remover flag, cleanup**: `GuestAnalysisClaimer` vira fallback fino (só verifica se há claim pendente a finalizar); revisar se `saveGuestPreview` "clássico" (por corpo de requisição) ainda tem algum outro caller que precise dele — se não tiver, simplificar.

Esta ordem é bem menor que o plano anterior: não toca em `AnalysisProtectionFacade`, não cria enum novo, não requer migration.

---

## 12. Rollback

Igual ao proposto no diagnóstico anterior: flag único controlando se `/adaptar/resultado` ainda aceita o branch guest e se `handleSubmit` ainda redireciona antes ou depois da análise. Como nenhuma migration é necessária, desligar a flag volta ao comportamento atual sem qualquer reversão de schema — só toggling de config, no mesmo padrão de kill-switch que `AnalysisProtectionConfig` já usa.

---

## Resumo da revisão

| | Diagnóstico anterior | Revisão |
|---|---|---|
| Guest processa a análise? | Não (adiado para pós-auth) | **Sim, imediatamente, como hoje** |
| Pipeline de proteção/IA tocado? | Sim (desacoplamento de `startGuestAnalysisJob`) | **Não** |
| Migration necessária? | Possível (novo status de enum) | **Nenhuma identificada** |
| Analytics | Tratado como "coordenar com spec futura" | **Já implementado — auditado, nenhuma mudança de evento necessária** |
| Guest não convertido | Implícito, não explicitado | **Explicitamente preservado (snapshot 30d, job permanente, resultado incluso)** |
| Onde muda o resultado guest | Nunca calculado antes do login | **Calculado normalmente, só nunca exposto ao browser antes do login** |
| Claim | `validateAndClaimSnapshot` + payload do cliente | **`validateAndClaimSnapshot` + conteúdo lido do servidor (novo: variante por `jobId`)** |
