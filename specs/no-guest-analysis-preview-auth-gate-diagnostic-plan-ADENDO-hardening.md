# EarlyCV — Adendo de hardening: os 4 pontos antes de liberar implementação

## Status desta spec

Documento de planejamento técnico. **Não implementar nada a partir daqui sem aprovação posterior.** Não altera código, não cria migration, não muda analytics.

Este é um **adendo** a `specs/no-guest-analysis-preview-auth-gate-diagnostic-plan-REVISAO.md`. Responde aos 4 pontos de hardening levantados antes da liberação, com investigação de código adicional feita agora (mesmo commit `290222d`, branch `develop`). Onde este adendo diverge da revisão anterior — principalmente sobre migration ser necessária — **vale este documento**.

---

## 1. Não confiar em `jobId` como segredo — token de posse real

Concordo com a objeção: `AnalysisJob.id` é um identificador (cuid não-adivinhável), não uma credencial de posse. A distinção importa porque cuid nunca foi desenhado para ser um segredo de autorização — só para evitar enumeração sequencial.

**Não existe hoje nenhum mecanismo de posse real para análise guest.** Confirmei que `AnalysisSession`/`sessionPublicTokenHash` (schema.prisma:1498-1514) é a mesma infraestrutura morta identificada na revisão anterior: o model existe na migration (`20260421141414_analysis_protection_observability/migration.sql:41,141`), mas `analysisSession.create()` **nunca é chamado em nenhum lugar de `apps/api/src`** — só é referenciado como leitura (`context.sessionPublicToken`, sempre `null` porque nada gera/seta o cookie `analysis_session_token`). Não é um mecanismo diferente que eu tinha ignorado — é a mesma morte, confirmada de outro ângulo.

**Existe, porém, um precedente funcional exato no próprio código para o padrão certo**: `AuthService` (fluxo de reset de senha), `auth.service.ts:489-501`:

```ts
const rawToken = randomBytes(32).toString("hex");
const tokenHash = createHash("sha256").update(rawToken).digest("hex");
const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

await this.database.$transaction(async (tx) => {
  await tx.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });
});
```

Token aleatório de 32 bytes gerado uma vez, hash SHA-256 persistido no banco, cru devolvido ao cliente uma única vez, invalidação de versões anteriores. Este é exatamente o padrão que a análise guest precisa e que hoje não tem.

**Recomendação**: ao criar a `AnalysisJob` guest, gerar um `guestPossessionToken` no mesmo molde — `randomBytes(32).toString("hex")`, hash SHA-256 persistido em uma nova coluna (`AnalysisJob.guestPossessionTokenHash String? @unique`), token cru devolvido ao cliente **uma vez**, na resposta de `analyze-guest` (não em GET subsequente). O cliente guarda o token cru só até a autenticação completar — não precisa ir para `localStorage` de longa duração, um `sessionStorage` por aba já é suficiente para o propósito (e, como veremos no ponto 4, o escopo por aba passa a ser parte da própria solução do problema de duas abas).

**Correção importante em relação à revisão anterior**: isso é **uma migration adicional** (uma coluna `guestPossessionTokenHash` + índice único em `AnalysisJob`), pequena e aditiva, mas real — a revisão anterior tinha concluído "nenhuma migration necessária", e essa conclusão não se sustenta mais com este requisito. Sinalizando isso explicitamente porque muda a seção 8 do plano de fases (ver seção 5 abaixo).

Toda validação de ownership guest (polling status, transferência de posse no claim) passa a exigir o token cru apresentado batendo com o hash armazenado — nunca mais `jobId` sozinho.

---

## 2. Endpoint guest vira status-only de verdade

Confirmado como achado crítico já na revisão anterior e reforçado aqui: `getAnalysisJobStatus` (`cv-adaptation.service.ts:1350-1391`) hoje retorna `adaptedContentJson`, `previewText`, `masterCvText`, `analysisCvSnapshotId`, `jobTitle`, `companyName` sempre que a checagem de ownership (frouxa, por `guestSessionHash` que hoje nunca é preenchido, ou pelo caso `isOwner=true` sem `userId` nem hash) passa.

**Mudança necessária, agora precisa**: para requisição não autenticada (ou autenticada como dono, mas ainda não claimed), a resposta do polling público deve se limitar estritamente a:

```json
{ "status": "pending" | "processing" | "succeeded" | "failed" }
```

Nunca incluir qualquer campo de conteúdo — nem por engano de serialização (recomendo um DTO de resposta explícito e diferente para o caso não-autenticado, não reaproveitar o mesmo shape do caso autenticado com campos "a mais" que o frontend simplesmente ignora — isso é exatamente o tipo de acidente que vaza dado).

**Sobre a pergunta "guest precisa saber `succeeded` antes de autenticar?"**: concordo com a observação de que, se o fluxo já redireciona para login imediatamente após o clique, **o frontend guest não precisa consultar esse endpoint antes de autenticar** — o redirecionamento acontece assim que `analyze-guest` responde com `{ jobId }` (que na prática nem chega a ser exposto ao JS do cliente, ver ponto 4). O polling só volta a ser relevante **depois** de autenticado, quando já é o fluxo autenticado normal de `getAnalysisJobStatus` (ownership por `userId`, sem mudança nesse caminho). Isso simplifica ainda mais o desenho: o endpoint público de status deixa de precisar ser chamado pelo guest em circunstância normal — só existiria como superfície residual a ser fechada por segurança (defesa em profundidade), não como parte do fluxo feliz.

---

## 3. Claim server-to-server, nunca payload do cliente

Sem mudança em relação à revisão anterior — só reforçando com o vocabulário correto: o modelo é

```
job guest já processado (status=succeeded)
→ valida token de posse (hash match, não jobId sozinho — ver ponto 1)
→ backend lê AnalysisJob.adaptedContentJson/previewText/masterCvText/jobTitle/companyName direto do banco
→ cria/vincula CvAdaptation com esse conteúdo
→ marca AnalysisJob.convertedAt/convertedCvAdaptationId (markAnalysisJobConverted, já existe)
```

A variante nova de `saveGuestPreview` (mudança já identificada na revisão anterior, seção 6) precisa, além de mudar a fonte dos dados (do corpo da requisição para o `AnalysisJob`), também trocar a validação de ownership de "hash de `guestSessionHash`" (que nunca funcionou, ponto 1) para "hash de `guestPossessionToken`". Nenhuma chamada de IA nova em nenhum ponto deste caminho — confirmado pela leitura anterior de `validateAndClaimSnapshot`, `saveGuestPreview` e `claimGuest`, nenhum dos três invoca o provedor de IA.

---

## 4. Duas abas — `state` gerado exclusivamente pelo backend, formalizado

Esta é a objeção mais séria e a investigação de código confirma que ela está certa: nenhuma correção que dependa só de adicionar mais um cookie resolve o problema, porque **o mecanismo de cookie em si é a causa raiz**.

Confirmado lendo `apps/api/src/auth/strategies/google.strategy.ts:14-20` — `state: false` explícito na config do `passport-google-oauth20` — e `apps/api/src/auth/oauth-signup-context.ts:38-77` — os 3 cookies (`oauth_signup_ctx`, `oauth_journey_sid`, `oauth_visitor_id`) são escritos com `path: "/api/auth/google"`, **globais ao navegador**, sem nenhum componente por aba ou por tentativa de login. `journeySessionInternalId` (o `sid`) É gerado por aba (vive em `sessionStorage`), mas isso não ajuda: o problema não é "o valor certo existe em algum lugar", é que **o cookie que carrega esse valor até o callback pode ser sobrescrito por outra aba entre o momento em que a aba A é redirecionada para o Google e o momento em que ela volta**. Qualquer novo cookie herda exatamente essa fragilidade:

```
aba A: /auth/google/start?sid=A&token=TOKEN_A  → cookie grava TOKEN_A
aba B: /auth/google/start?sid=B&token=TOKEN_B  → cookie SOBRESCREVE para TOKEN_B
aba A: usuário completa o consentimento no Google, volta para o callback
       → cookie hoje contém TOKEN_B (de B), não TOKEN_A
       → análise B seria vinculada à conta que o usuário criou pela aba A
```

Nenhum "cookie a mais" resolve isso — todos compartilham o mesmo defeito estrutural: são globais ao navegador, não amarrados à tentativa de OAuth específica.

### 4.1 Desenho formalizado — `state` gerado e controlado exclusivamente pelo backend

Ponto central desta formalização: **o navegador nunca escolhe, gera ou influencia o valor de `state`.** Ele só recebe um valor opaco do backend e o repassa. Isso elimina qualquer ambiguidade sobre o cliente conseguir forjar correlação.

```
1. Guest clica "Analisar" → fluxo já descrito (pontos 1-3) → frontend fica de posse de:
   jobId (AnalysisJob.id)
   guestPossessionToken (cru, só em memória/sessionStorage da aba, nunca em URL)

2. Frontend decide ir para autenticação (imediatamente após o clique, por
   desenho de produto) → chama um novo endpoint backend, ex:
   POST /auth/oauth-attempts
   body: { jobId, guestPossessionToken, conversionContext, journeySessionInternalId, visitorId }
   (HTTPS, corpo de requisição — nunca URL/query string; é o único lugar onde
   o guestPossessionToken cru trafega depois da resposta inicial de analyze-guest)

3. Backend, dentro desse endpoint:
   a. hash(guestPossessionToken) == AnalysisJob.guestPossessionTokenHash? Senão, 401/404.
   b. AnalysisJob.ownerKind == "guest" e ainda não claimed? Senão, 409/404.
   c. gera state = randomBytes(32).toString("hex") — aleatório, opaco, decidido
      só pelo backend, nunca recebido do cliente como input livre.
   d. cria OAuthAttempt:
        state          (armazenado em claro, indexado — não é segredo, é só
                         correlator; quem precisa de segredo é o
                         guestPossessionToken, que NUNCA é gravado nesta tabela
                         em claro, só a referência analysisJobId já validada)
        analysisJobId
        conversionContext
        journeySessionInternalId
        visitorId
        expiresAt      (curto — mesmos 10 min do padrão atual de oauth_*)
        consumedAt = null
   e. retorna { state } ao frontend.

4. Frontend navega para /auth/google/start?state=<state opaco>
   (state em URL é aceitável — é exatamente o mecanismo de correlação do
   protocolo OAuth2, não um segredo de posse; o segredo real, guestPossessionToken,
   já foi consumido no passo 2/3 e não precisa mais trafegar)

5. auth.controller.ts (googleStart) repassa: authenticate("google", { state })
   → passport-google-oauth20 inclui state na URL de autorização do Google

6. Google devolve exatamente esse state no callback — amarrado unicamente
   àquela tentativa de autorização específica, imune a qualquer escrita de
   cookie feita por outra aba nesse meio-tempo, porque não depende de
   cookie nenhum para esta correlação.

7. googleCallback, dentro de UMA transação de banco:
   a. resolve OAuthAttempt por state (lookup direto, não hash — state não é
      segredo).
   b. valida: existe? expiresAt no futuro? consumedAt ainda null?
      Qualquer falha → 401, sem prosseguir.
   c. marca consumedAt = now() (dentro da mesma transação — ver 4.2 sobre replay).
   d. prossegue com finishSocialLogin (upsert de User/AuthAccount, como hoje).
   e. usando OAuthAttempt.analysisJobId, executa a transferência de posse
      (AnalysisJob.userId = novo user) e, se status=succeeded, o claim
      server-side (ponto 3 — sem reprocessar).
```

### 4.2 Confirmação explícita: isso resolve duas abas, replay, CSRF e callback duplicado

- **Duas abas**: resolvido por construção. Cada aba que chama `POST /auth/oauth-attempts` gera seu próprio `OAuthAttempt` com seu próprio `state`, amarrado ao `analysisJobId` daquela aba especificamente. Não existe mais nenhum valor global "mais recente" que uma aba possa sobrescrever por cima da outra — a correlação viaja dentro do protocolo OAuth (ida e volta via Google), não em storage compartilhado do navegador. Se a aba A inicia a tentativa e completa o login, o Google devolve o `state` de A, e só o `state` de A existe naquele momento de callback — não há como a tentativa de B "vencer" a de A, porque não há mais uma única variável mutável global disputada pelas duas.
- **Replay**: um mesmo `state` reapresentado ao callback depois de já ter `consumedAt` setado é rejeitado (passo 7b). Como a marcação de `consumedAt` acontece **na mesma transação** que resolve a tentativa e antes de prosseguir com o claim, não há janela em que um replay concorrente consiga passar pela checagem antes da marcação ser efetivada (a segunda transação concorrente vê o `consumedAt` já setado pela primeira, ou colide no lock de linha do Postgres — mesmo padrão já usado em `validateAndClaimSnapshot`). `expiresAt` curto (10 min) limita adicionalmente qualquer janela residual.
- **CSRF**: resolvido pela própria natureza do `state` gerado pelo backend — um atacante não pode iniciar um callback válido sem primeiro ter deflagrado uma tentativa legítima (passo 2/3), e mesmo que consiga, o `state` daquela tentativa está amarrado a um `analysisJobId` que já foi validado por posse de token no passo 3a — não há como injetar um `state` arbitrário e fazer o backend aceitar uma correlação forjada.
- **Callback duplicado** (Google ou rede reenviando a mesma requisição de callback duas vezes): a primeira execução consome o `state` (marca `consumedAt`) dentro da transação; a segunda encontra `consumedAt` já setado e é rejeitada antes de repetir claim ou criação de conta. Isso é independente da idempotência já existente de `finishSocialLogin` (upsert por `providerAccountId`/email) — a proteção aqui é especificamente contra reclamar a análise duas vezes, não só contra duplicar o usuário.

**Isso também fecha, de graça, a lacuna de CSRF já identificada separadamente** (`state: false` sem defesa equivalente) — os dois problemas (duas abas + CSRF) se resolvem com a mesma correção.

**Trade-off honesto, mantido**: isso é mais invasivo do que "adicionar um 4º cookie httpOnly" — substitui o mecanismo atual de `oauth_signup_ctx`/`oauth_journey_sid`/`oauth_visitor_id` (3 cookies) por um fluxo de duas chamadas (criar tentativa → completar OAuth) correlacionado por `state`. Nenhuma mitigação "melhor esforço" em cima só do esquema de cookies fecha esse requisito de verdade — todas dependem de qual aba escreveu por último. Este desenho é a recomendação final para este ponto.

---

## 5. Impacto no plano de fases e na conclusão "nenhuma migration"

A revisão anterior concluía "nenhuma migration identificada como necessária". Isso muda:

- **Migration 1 (pequena, aditiva)**: `AnalysisJob.guestPossessionTokenHash String? @unique` (ponto 1).
- **Migration 2 (pequena, aditiva, opcional dependendo do desenho exato)**: uma tabela leve de correlação de tentativa OAuth por `state` (ponto 4) — alternativa a isso é usar `session: true` do passport com sessão de servidor, mas dado que a API é stateless (JWT, sem `express-session` hoje identificado), uma tabela de curta duração (TTL de poucos minutos, limpável) é mais consistente com o resto da arquitetura.

Ambas são aditivas, não tocam dado existente, seguem a convenção do projeto (`npm run railway:touch-api` junto do commit da migration).

O restante do plano de fases da revisão anterior (seção 11 daquele documento) continua válido — a Fase 3 ("OAuth: 4º cookie + transferência de posse") passa a ser "OAuth: `state` + correlação server-side + transferência de posse", um pouco mais trabalho, mas mesma posição no plano.

---

## 6. Retenção do guest não convertido — tabela definitiva (código real, não comentário de schema)

As duas afirmações anteriores ("`AnalysisCvSnapshot` expira em 30 dias" e "retenção permanente de `AnalysisJob`/`AnalysisCvSnapshot`") **não eram contraditórias — eram imprecisas por tratar as duas tabelas como uma coisa só.** Reli o mecanismo de cleanup real: `apps/api/src/cv-adaptation/cv-adaptation-snapshot-cleanup.scheduler.ts` (`@Cron("15 2 * * *")`, diário) → `CvAdaptationService.cleanupExpiredGuestSnapshots()` (`cv-adaptation.service.ts:2427-2465`). Ele busca `AnalysisCvSnapshot` com `userId: null` **e** `expiresAt <= now` **e** `cvAdaptation: { is: null }` (nunca convertido) → deleta os objetos de storage (arquivo original + texto extraído) → deleta a linha do snapshot.

**Achado decisivo**: `AnalysisJob.analysisCvSnapshotId` tem `onDelete: SetNull` no schema. Quando o snapshot expira e é apagado, o `AnalysisJob` **sobrevive** — só perde a referência ao snapshot (vira `null`). `adaptedContentJson`, `previewText`, `masterCvText`, `jobTitle`, `companyName`, `jobDescriptionText` continuam intactos na linha do `AnalysisJob`, que não tem campo de expiração próprio e nenhum job de cleanup o atinge. Não há divergência real: **o resultado é retido separadamente do material de origem**, por desenho, não por acidente.

| Dado | Onde é armazenado | Guest não convertido | Retenção real atual | Mecanismo de expiração/cleanup |
|---|---|---|---|---|
| `AnalysisJob` (linha) | tabela `AnalysisJob` | Sim | Permanente | Nenhum job a atinge |
| `adaptedContentJson` | coluna de `AnalysisJob` | Sim | Permanente | Nenhum |
| `previewText` | coluna de `AnalysisJob` | Sim | Permanente | Nenhum |
| `masterCvText` | coluna de `AnalysisJob` | Sim | Permanente | Nenhum |
| `jobDescriptionText` | coluna de `AnalysisJob` | Sim | Permanente | Nenhum |
| `AnalysisCvSnapshot` (linha) | tabela `AnalysisCvSnapshot` | Sim, até expirar | **30 dias** se nunca convertido; permanente se `cvAdaptation` existir | `cleanupExpiredGuestSnapshots`, diário 02:15 |
| Arquivo original do CV (storage) | storage, `originalFileStorageKey` | Sim, até expirar | **30 dias** (deletado junto com o snapshot) | Idem acima |
| Texto extraído do CV (`textStorageKey`) | storage | Sim, até expirar | **30 dias** (idem) | Idem acima |
| `visitor_id` associado à análise | metadata de `BusinessFunnelEvent` (`analysis_started`/`analysis_completed`) — sem coluna própria em `AnalysisJob`/`AnalysisCvSnapshot` | Sim | **~180 dias** (env `ANALYSIS_RETENTION_BUSINESS_EVENTS_DAYS`, default) | `analysis-retention.scheduler.ts`, diário 02:00, `AnalysisRetentionService.purgeExpiredData()` |
| `journeySessionInternalId` associado | idem (metadata de evento) | Sim | **~180 dias**, idem | Idem |
| `conversion_context`/origem | idem (metadata de evento) | Sim | **~180 dias**, idem | Idem |

**Confirmação da decisão de produto**: "não queremos perder a análise guest de quem não converte" está garantido — `AnalysisJob` (linha + resultado calculado + descrição da vaga) é permanente hoje, sem necessidade de nenhuma mudança. Isso **não decide implicitamente** que o arquivo original do CV precisa virar permanente — ele continua expirando em 30 dias como já acontece hoje, comportamento preservado sem mudança nesta implementação.

**Nuance nova, que vale registrar**: depois de ~180 dias, a análise (`AnalysisJob`) continua existindo, mas o vínculo com `visitor_id`/`journeySessionInternalId`/`conversion_context` (a "origem" da jornada) só sobrevive dentro dos eventos de `BusinessFunnelEvent`, que são purgados. Ou seja, **preservamos o resultado, mas não indefinidamente o contexto de origem** — não é uma perda da análise em si, mas é uma perda de rastreabilidade de jornada depois desse prazo. Isso é comportamento já existente hoje (não introduzido por este plano), mas ficou implícito nos documentos anteriores e merece estar explícito.

**Constraint importante para a implementação** (não descoberto antes, decorre desta auditoria): a nova variante de claim server-side (ponto 3) **precisa continuar criando/vinculando a `CvAdaptation` via `analysisCvSnapshotId`**, exatamente como `saveGuestPreview` faz hoje — é essa vinculação que faz a condição `cvAdaptation: { is: null }` do job de cleanup excluir o snapshot da purga de 30 dias. Se a nova variante de claim pular essa etapa (por exemplo, só transferir `AnalysisJob.userId` sem nunca materializar a `CvAdaptation`), o arquivo original do CV de um usuário que **converteu** continuaria sendo apagado aos 30 dias por engano — uma regressão real de retenção para quem se cadastrou. Este é um critério de aceite a mais: **claim sem `CvAdaptation` vinculada = bug**, não variação aceitável.

Isso é uma decisão de produto/dados já existente, não uma propriedade neutra do banco — permanece registrado que uma política formal de retenção/LGPD (uso pela Base de Talentos/EarlySignal, resposta a pedido de exclusão de quem nunca criou conta) segue como lacuna de governança pré-existente, não bloqueante para esta implementação.

---

## 7. Analytics — confirmado, zero mudança

Sem alteração em relação à auditoria da revisão anterior. A leitura proposta (`analysis_started → analysis_completed → signup_completed → analysis_result_viewed`, com as três métricas — taxa de gate, taxa de consumo, abandono no cadastro) é inteiramente computável com os eventos e o payload que já existem (`visitor_id`, `sessionInternalId`, `mode`, `idempotencyKey` por evento). Nenhum evento novo, nenhuma mudança de ownership, nenhuma mudança de semântica.

---

## 8. Rollback por feature flag — validado end-to-end

### 8.1 A infraestrutura de flag existente não serve como está

Auditei `AnalysisConfigService`/`AnalysisProtectionConfig` (`apps/api/src/analysis-protection/analysis-config.service.ts`, `analysis-config-backoffice.service.ts`): é um mecanismo real — tabela no banco, cache de 5s, audit trail (`AnalysisProtectionConfigAudit`) escrito em toda mudança dentro de transação. Mas é **consumido exclusivamente dentro de `analysis-protection.facade.ts`** (11 ocorrências), 100% backend, controlando só `rolloutMode` dos gates de proteção. **Não encontrei nenhum endpoint público que exponha esse valor ao frontend, nenhum uso de feature flag nativo do PostHog no código, e nenhum precedente de um flag hoje controlando frontend e backend simultaneamente.** Isso significa: reaproveitar essa infraestrutura de *padrão* (tabela + audit + cache) é seguro, mas ela precisa de uma peça nova — uma forma do frontend consultar o valor — que hoje não existe.

### 8.2 Desenho recomendado — uma única flag, dois pontos de leitura

Nome proposto: `guestAnalysisAuthGateEnabled` (boolean), armazenado no mesmo padrão de `AnalysisProtectionConfig` (tabela, audit trail, cache curto — reaproveita a infraestrutura já comprovada, só adiciona uma chave).

**Leitura backend**: direta, do serviço já existente (`AnalysisConfigService.getConfig()`), sem nenhuma peça nova.

**Leitura frontend**: precisa de um endpoint novo, pequeno e público, ex. `GET /cv-adaptation/config/public` → `{ guestAnalysisAuthGateEnabled: boolean }`. Chamado pelo frontend no carregamento de `/adaptar` (sem cache de longa duração no cliente — busca fresca por sessão de análise, não embutida em build-time), para minimizar a janela em que frontend e backend possam divergir durante o exato momento de um toggle.

### 8.3 Branches que precisam consultar a flag (lista explícita)

| Branch | Comportamento com flag OFF (atual) | Comportamento com flag ON (novo) |
|---|---|---|
| `apps/web/src/app/adaptar/page.tsx` (`handleSubmit`, branch guest) | Chama `analyzeGuestCv`, faz polling inline, mostra progresso na própria página | Chama `analyzeGuestCv`, redireciona imediatamente para `/entrar` (com o fluxo de `POST /auth/oauth-attempts` do ponto 4, se o usuário escolher Google) |
| `guest-analysis-storage.ts` (armazenamento local do resultado) | Ativo — grava `guestAnalysis` em `sessionStorage`/`localStorage` | Nunca escrito — resultado não chega ao browser antes do login |
| `apps/api/.../analysis-jobs/:jobId` (polling público, `getAnalysisJobStatus`) | Comportamento atual (inclui `adaptedContentJson`/`previewText`/etc. quando ownership passa) | **Sempre status-only** para chamada não autenticada, independentemente de qualquer checagem de ownership — a flag age como um segundo portão, não substitui a correção do ponto 2, mas garante que, com a flag ligada, mesmo um bug futuro na checagem de ownership não vaza conteúdo |
| `apps/web/src/app/adaptar/resultado/page.tsx` | Branch guest ativo (`GuestBlurOverlay`, mocks, CTA de cadastro) | Branch guest **inatingível** — página exige sessão autenticada antes de renderizar qualquer coisa relacionada a análise |
| Claim (`saveGuestPreview` e variante nova) | Só a variante clássica (aceita `adaptedContentJson` do corpo da requisição) está ativa | Só a variante nova (lê do `AnalysisJob` no servidor, valida `guestPossessionTokenHash`) está ativa |
| OAuth (`/auth/google/start`, callback) | Fluxo atual de 3 cookies (`oauth_signup_ctx`/`oauth_journey_sid`/`oauth_visitor_id`), sem `POST /auth/oauth-attempts`, sem `state` custom, sem auto-claim | Fluxo novo do ponto 4 (`OAuthAttempt` + `state` gerado pelo backend + auto-claim pós-callback) |

### 8.4 Uma flag é suficiente — com uma ressalva operacional

Uma única flag é suficiente e é a recomendação, desde que:

1. **O backend seja sempre a autoridade final**, nunca o frontend. Cada branch server-side acima deve reler a flag por conta própria (não confiar em um parâmetro que o frontend mande dizendo "estou no modo novo") — isso já é a única forma segura de fazer isso, e evita que um frontend desatualizado (cache de página, CDN) force o backend a um comportamento que ele não pretende ter.
2. **A leitura do frontend não pode ser cacheada por muito tempo** (seção 8.2) — o risco real de uma única flag é a janela entre o toggle acontecer e todas as abas/sessões abertas perceberem a mudança. Como os dois lados (frontend UI branch e backend content-exposure branch) são desenhados para ambos degradarem de forma segura no pior caso — se o backend já está em modo novo (status-only) mas uma aba antiga ainda espera conteúdo no polling, a pior consequência é a UI antiga mostrar um estado vazio/quebrado nessa janela curta, nunca vazamento de conteúdo — considero o risco residual aceitável e não recomendo duas flags separadas. Duas flags introduziriam o risco pior: backend em modo novo (seguro) com frontend em modo antigo por engano de forma persistente, ou vice-versa, por erro humano de operação — pior do que a janela curta de uma única flag.
3. Recomendo alternar a flag fora de horário de pico e observar `analysis_started`/`analysis_completed`/`analysis_result_viewed` nos primeiros minutos pós-toggle, exatamente pela janela de divergência do item 2.

### 8.5 Confirmação do requisito do usuário

"Mudar uma configuração deve restaurar o fluxo guest antigo completo sem rollback de commit ou banco": confirmado — desligar a flag restaura, em runtime, via config já editável (mesmo mecanismo de `AnalysisProtectionConfig`/audit trail que já existe hoje), todos os 6 branches da tabela 8.3 ao comportamento atual, sem reverter nenhuma migration (as duas migrations do ponto 5 são aditivas e inertes com a flag desligada) e sem reverter nenhum commit.

---

## 9. Nova condição encontrada que precisa de atenção antes da aprovação final

Uma constatação da seção 6 não estava explicitada em nenhum documento anterior e se encaixa exatamente no critério que você pediu para eu destacar: **risco de perder retenção de quem converteu** (não de quem não converte). Se a nova variante de claim server-side não materializar a `CvAdaptation` vinculada ao `analysisCvSnapshotId` da mesma forma que `saveGuestPreview` faz hoje, o job de cleanup de 30 dias (`cleanupExpiredGuestSnapshots`) apagaria o arquivo original do CV de um usuário que **já criou conta**, porque a condição de exclusão do cleanup (`cvAdaptation: { is: null }`) deixaria de ser satisfeita corretamente. Não é um risco novo introduzido pelo plano — é um requisito de correção que só ficou visível nesta auditoria de retenção, e que já está incorporado como critério de aceite explícito na seção 6. Nenhuma outra condição nova que exponha resultado guest, associe análise errada, reprocesse IA, perca análise de não convertido, ou quebre analytics foi encontrada nesta rodada — os quatro pontos anteriores e este quinto (retenção pós-claim) cobrem, com base no código atual, tudo que foi mapeado até aqui.

---

## 10. Critérios obrigatórios antes do primeiro commit funcional — status final

| Critério | Status |
|---|---|
| Nenhum resultado guest chega ao browser | Endereçado (ponto 2) |
| Claim lê resultado exclusivamente do backend | Endereçado (ponto 3) |
| Claim não reprocessa IA | Confirmado |
| Ownership guest deixa de depender só de `jobId` | Endereçado (ponto 1 — token de posse real, migration pequena) |
| Duas abas não conseguem cruzar análises | Endereçado (seção 4.1/4.2 — `state` gerado pelo backend, formalizado, migration pequena) |
| `AnalysisJob` não convertido permanece | Confirmado com tabela definitiva (seção 6) |
| Claim vinculado corretamente preserva retenção do arquivo original | **Novo critério explícito** (seção 9) — claim sem `CvAdaptation` vinculada é bug |
| Fluxo autenticado atual não muda | Confirmado, sem mudança |
| Analytics atual não é redesenhado | Confirmado (seção 7) |
| Feature flag restaura o fluxo antigo completo, sem rollback de commit/banco | Validado end-to-end (seção 8, 6 branches explícitos) |

## 11. Conclusão — o plano está pronto para implementação?

**Sim, com duas migrations pequenas e aditivas já identificadas e nenhuma condição nova encontrada nesta rodada que bloqueie a aprovação.**

Resumo do que muda em relação ao ponto de partida ("mudança estrutural assustadora"):

- `AnalysisProtectionFacade`, `processAnalysisJob`, todo o pipeline de IA e proteção: **intocados**.
- Fluxo autenticado: **intocado**.
- Analytics: **intocado** — auditado, já saneado, zero evento novo.
- Migrations: duas, pequenas, aditivas (`AnalysisJob.guestPossessionTokenHash`; tabela `OAuthAttempt` com TTL curto). Nenhuma toca dado existente.
- Trabalho real concentrado em: (1) parar de expor conteúdo em endpoints/páginas para não autenticado, (2) um novo par de endpoints (`POST /auth/oauth-attempts`, `GET /cv-adaptation/config/public`) e a troca do `state` no `google.strategy.ts`, (3) uma variante server-side do claim que lê do `AnalysisJob` em vez do corpo da requisição, preservando a vinculação de `CvAdaptation` que já existe.
- Rollback: uma única flag, runtime, sem commit nem reversão de migration, com os 6 branches que precisam obedecê-la listados explicitamente.

Antes do primeiro commit funcional, os 10 critérios da tabela acima (seção 10) devem estar todos endereçados no design detalhado de cada fase — este documento resolve todos no papel; a implementação real deve ser verificada contra eles fase a fase, não só no fechamento.
