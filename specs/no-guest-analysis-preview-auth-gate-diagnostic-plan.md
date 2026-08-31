# EarlyCV — Diagnóstico e plano técnico: gate de autenticação antes do resultado da análise

## Status desta spec

Documento de planejamento técnico. **Não implementar nada a partir desta spec sem aprovação posterior.**

Restrições desta etapa: não alterar código, não criar migration, não mudar eventos de analytics, não fazer commits.

Investigação realizada em 2026-08-24, branch `develop`, commit `290222d`. Todo achado abaixo é citação direta do código nesse ponto no tempo — se divergir do comportamento real ao implementar, o código é a fonte da verdade, não este documento.

Nota lateral: existe outro documento não commitado no repositório, `specs/analytics-v2-saneamento-evolucao-plan.md`, também com status "não implementar ainda", que já propõe formalizar `signup_completed`, `analysis_completed`, `analysis_failed` e `analysis_result_viewed` como eventos oficiais (Fase B daquele plano). Há sobreposição real entre os dois planos — ver seção G.5.

---

## A. Estado atual

### Fluxo guest hoje (achado central)

O fluxo guest **já processa a análise imediatamente** ao clicar em "Analisar" — não existe hoje nenhum gate de autenticação antes do custo de IA. O resultado é sempre calculado; o que muda para guest é só a UI: a página de resultado borra a maior parte do conteúdo (`GuestBlurOverlay`) e mostra um CTA de cadastro. Ou seja, **o produto de hoje já implementa a "Opção B" da seção D** (processar guest, bloquear parte do resultado) — só que bloqueia parcialmente (mostra 1 item completo) em vez de bloquear tudo.

Passo a passo real (`apps/web/src/app/adaptar/page.tsx`):
1. Usuário preenche CV (upload ou texto) + descrição da vaga no formulário único de `/adaptar`.
2. Clique no CTA "Descobrir meus erros no CV" dispara `handleSubmit` (`page.tsx:388-653`).
3. `isAuthenticated = !!userName` (`page.tsx:351`, resolvido via `getAuthStatus()` em `useEffect`) decide o branch.
4. Guest → Server Action `analyzeGuestCv()` (`apps/web/src/lib/cv-adaptation-api.ts:409-443`) → `POST /cv-adaptation/analyze-guest`. O arquivo vai direto no mesmo `FormData` da requisição de análise — não há upload prévio separado.
5. Backend (`CvAdaptationPublicController.analyzeGuest`, sem guard de auth) cria uma `AnalysisCvSnapshot` (persiste texto **e arquivo original em storage**, TTL de 30 dias para guest — `cv-adaptation.service.ts:5050-5071`) e uma `AnalysisJob` (`ownerKind: "guest"`, `status: "pending"`, `userId: null`, `guestSessionHash`) de forma síncrona e barata (`cv-adaptation.service.ts:971-979`).
6. Processamento assíncrono dispara imediatamente (`processAnalysisJob`, `cv-adaptation.service.ts:1139`): status → `processing`, evento `analysis_started` (linha 1171) — **isso já acontece antes de qualquer gate pesado**. Em seguida passam os gates de `AnalysisProtectionFacade` (payload, kill-switch, rate-limit, anti-bot, turnstile completo, cache, dedupe lock, usage policy) e só então a chamada real à IA.
7. Resultado grava em `AnalysisJob`, evento `analysis_completed`.
8. Frontend faz polling (`pollAnalysisJob`) e ao concluir grava o payload inteiro em `sessionStorage` **e** `localStorage` sob a chave `guestAnalysis` (`guest-analysis-storage.ts`), incluindo `guestSessionPublicToken`.
9. `/adaptar/resultado` (`page.tsx`, ~4800 linhas) renderiza: 1 item completo + resto borrado atrás de `GuestBlurOverlay` com conteúdo mockado (`GUEST_MOCK_*`), CTA "Crie conta para liberar" → `/entrar?next=/adaptar/resultado?autoSave=1&ctx=analysis_guest`.
10. Evento `analysis_result_viewed` dispara no frontend **sem gate de autenticação** — já acontece hoje tanto para guest quanto para autenticado.
11. Em `/entrar`, usuário escolhe Google OAuth ou email/senha. `GoogleAuthButton` acrescenta `sid` (journey session) e `vid` (visitor id) à URL de `/auth/google/start` e grava cookie `post_auth_next`.
12. Backend `/auth/google/start` captura `ctx`/`sid`/`vid` via middleware e grava em 3 cookies httpOnly de 10 min, escopados a `/api/auth/google`.
13. Callback do Google: lê e limpa os 3 cookies, cria/associa `User` + `AuthAccount` numa transação, emite `signup_completed` (idempotente por `userId`) ou `login_completed` (**não** idempotente), gera JWT e redireciona para `/auth/social-callback?accessToken=...&refreshToken=...` (**tokens na URL**).
14. `social-callback/route.ts` (Next.js) valida os tokens, grava cookies httpOnly de app, lê e limpa o cookie `post_auth_next` para decidir destino.
15. No dashboard, `GuestAnalysisClaimer` (montado também em `/meu-perfil`) lê `guestAnalysis` do storage local, chama `saveGuestPreview()` (não `claimGuestAnalysis` — este último só é usado no fluxo de "usar crédito"), que internamente persiste como `CvAdaptation` vinculada ao `userId`, dispara `validateAndClaimSnapshot` (transação com checagem de `claimedByUserId`, hash de sessão guest, expiração), limpa o storage local e redireciona para `/adaptar/resultado?adaptationId=...`.

**Importante**: hoje, o dado que sobrevive ao round-trip OAuth é o *resultado já calculado* (via `localStorage`), não uma "intenção pré-análise". Se o usuário preenche o formulário mas ainda não clicou em analisar, **não existe nenhuma persistência hoje** — só estado React em memória.

### Fluxo autenticado hoje

Idêntico ao guest a partir do passo 4, mas via `POST /cv-adaptation/analyze` (`JwtAuthGuard` no controller), criando `AnalysisJob` com `ownerKind: "authenticated"`, `userId` preenchido, sem `guestSessionHash`. O mesmo `processAnalysisJob` processa os dois modos (parametrizado por `mode`). Resultado é sempre uma `CvAdaptation` completa vinculada ao `userId`, sem blur.

### Achado estrutural mais importante para o plano

`AnalysisJob` **já é uma tabela unificada** guest/autenticado (`ownerKind` + `userId` nullable + `guestSessionHash`). `AnalysisCvSnapshot` **já** persiste CV (texto + arquivo original em storage) de forma independente de autenticação, com TTL de 30 dias para guest. O "claim" (`validateAndClaimSnapshot`, `cv-adaptation.service.ts:5086-5154`) já roda em transação com proteção de dedupe (`claimedByUserId`) e mismatch de sessão. **A infraestrutura para persistir inputs antes de autenticar e vincular depois já existe quase inteira** — o que falta é apenas *não iniciar/expor o processamento e o resultado* antes da autenticação, e propagar um identificador do snapshot através do OAuth do mesmo jeito que `sid`/`vid`/`ctx` já são propagados hoje.

---

## B. Mapa de arquivos

| Arquivo | Responsabilidade atual | Impacto | Alteração provável |
|---|---|---|---|
| `apps/web/src/app/adaptar/page.tsx` | Formulário CV+vaga, decide guest vs auth, dispara análise | Crítico | Alterar `handleSubmit`: se guest, não chamar `analyzeGuestCv` que processa — persistir input e redirecionar para auth |
| `apps/web/src/lib/cv-adaptation-api.ts` | Server Actions (`analyzeGuestCv`, `analyzeAuthenticatedCv`, `saveGuestPreview`, `claimGuestAnalysis`) | Crítico | Nova Server Action de "persistir intenção guest"; revisar `saveGuestPreview`/`claimGuestAnalysis` |
| `apps/web/src/app/adaptar/resultado/page.tsx` | Renderiza preview borrado para guest, dispara `analysis_result_viewed` | Crítico | Remover todo caminho de renderização para não autenticado; página deve exigir sessão |
| `apps/web/src/lib/guest-analysis-storage.ts` | Persistência local do resultado guest (session+localStorage) | Alto | Provavelmente obsoleto ou reduzido a apenas rascunho de formulário (sem resultado) |
| `apps/web/src/app/dashboard/guest-analysis-claimer.tsx` | Client-side claim ao logar, fallback de recuperação | Alto | Mantém como rede de segurança; passa a ser fallback, não caminho principal |
| `apps/web/src/app/adaptar/resultado/guest-analysis-persistence.ts` | Decide se auto-salva análise guest ao chegar autenticado | Médio | Revisar junto com o novo fluxo |
| `apps/web/src/app/entrar/page.tsx`, `google-auth-button.tsx` | Login/cadastro, dispara OAuth com contexto | Alto | Precisa carregar novo identificador (snapshot) junto de `sid`/`vid`/`ctx` |
| `apps/web/src/app/auth/social-callback/route.ts` | Recebe tokens pós-OAuth, decide redirect | Médio | Pode precisar disparar claim automático ou redirecionar para status de processamento |
| `apps/api/src/cv-adaptation/cv-adaptation-public.controller.ts` | Rotas guest: `analyze-guest`, `analysis-jobs/:jobId` (polling) | Crítico | `analyze-guest` muda de "cria+processa" para "cria snapshot, não processa"; polling de job guest precisa negar conteúdo a não autenticado |
| `apps/api/src/cv-adaptation/cv-adaptation.service.ts` | `startGuestAnalysisJob`, `processAnalysisJob`, `claimGuest`, `validateAndClaimSnapshot`, `getAnalysisJobStatus` | Crítico | Separar "criar snapshot" de "disparar processamento"; reaproveitar `validateAndClaimSnapshot` no auto-claim pós-OAuth |
| `apps/api/src/cv-adaptation/dto/claim-guest-adaptation.dto.ts` | Contrato de claim | Médio | Possível novo DTO leve para "iniciar análise pós-auth por snapshotId" |
| `apps/api/src/auth/oauth-signup-context.ts` | Cookies httpOnly de contexto OAuth (`ctx`,`sid`,`vid`) | Crítico | Adicionar 4º identificador (`analysisCvSnapshotId` ou `analysisJobId`) no mesmo padrão |
| `apps/api/src/auth/auth.controller.ts` | `/auth/google/start`, `/auth/google/callback`, redirect social | Alto | Callback deve, quando aplicável, disparar claim/analyze automático |
| `apps/api/src/auth/auth.service.ts` | `finishSocialLogin`, `issueSession`, `recordSignupCompleted/LoginCompleted` | Alto | Possível chamada a um novo "auto-claim" pós-login social |
| `apps/api/src/auth/strategies/google.strategy.ts` | Estratégia Passport Google, `state: false` | Médio (segurança, não bloqueante) | Considerar reativar `state` — ver riscos |
| `apps/api/src/analysis-protection/*` | Facade de proteção (rate-limit, dedupe, turnstile, usage policy) | Nenhum funcional | Não precisa mudar — já independe de auth |
| `apps/api/src/analysis-observability/*` | Registry/ownership/idempotência de eventos de funil | Médio | Ajustar apenas se novos eventos forem aprovados (ver seção G.5) |
| `packages/database/prisma/schema.prisma` | Modelos `AnalysisJob`, `AnalysisCvSnapshot`, `CvAdaptation` | Baixo (ver seção I) | Provavelmente nenhuma migration obrigatória; no máximo um novo valor de enum opcional |

---

## C. Riscos

**Crítico**
- Deixar qualquer rota (`GET /cv-adaptation/analysis-jobs/:jobId`, página `/adaptar/resultado`) capaz de retornar conteúdo de análise para requisição não autenticada, mesmo que a UI não mostre — a regra final ("nenhum endpoint deve permitir consulta de resultado por não autenticado") não é garantida hoje: `getAnalysisJobStatus` permite acesso quando `job.userId` e `job.guestSessionHash` estão **ambos ausentes** (`isOwner = true` no caso raro) — precisa ser revisto explicitamente antes de remover a blindagem de UI que hoje mascara isso.
- OAuth sem proteção CSRF/state (`state: false` em `google.strategy.ts:19`) combinado com um novo identificador de snapshot propagado por cookie: se o novo cookie puder ser forjado/reaproveitado, há risco de vincular a análise errada ao usuário errado. Mitigação: o `validateAndClaimSnapshot` já existente faz mismatch check por hash de sessão — deve continuar obrigatório mesmo no auto-claim.

**Alto**
- Duas abas simultâneas: cookies de contexto OAuth (`oauth_signup_ctx`, `oauth_journey_sid`, `oauth_visitor_id`, e o novo de snapshot) são globais por navegador, sem isolamento por aba — a segunda aba sobrescreve o cookie da primeira antes do callback completar. Já é uma limitação hoje; um novo identificador de snapshot herda o mesmo risco.
- Falha no callback OAuth (usuário nega permissão, erro do Google) não tem tratamento hoje — vira 401 JSON cru no domínio da API, sem redirect amigável. Isso já é ruim hoje, mas fica pior na nova UX porque o usuário terá acabado de investir esforço preenchendo CV+vaga e pode perder a sensação de progresso.
- Sobreposição com o plano de analytics (`specs/analytics-v2-saneamento-evolucao-plan.md`): ambos os planos mexem em `analysis_started`/`analysis_completed`/`analysis_result_viewed`/`signup_completed`. Implementar os dois em paralelo sem coordenação pode gerar decisões conflitantes de ownership/semântica.

**Médio**
- `analysis_result_viewed` deixa de disparar para o slice `mode: guest` — comportamento esperado, mas qualquer dashboard existente que meça esse corte vai zerar. Precisa checagem manual do lado do Paulo (fora do escopo de código).
- `login_completed` não é idempotente (sem `idempotencyKey`), diferente de `signup_completed` — replay do callback duplicaria esse evento. Preexistente, não é causado pela mudança, mas vale corrigir junto já que estaremos mexendo na área.
- `analysis_started` hoje dispara **antes** dos gates completos de proteção (marca "job aceito para processamento", não "IA de fato iniciada") — se a semântica for redefinida para casar com o novo fluxo (job só entra em processamento pós-auth), o *momento* do disparo muda, mesmo que o *nome* não mude. Isso é uma mudança de comportamento observável em analytics que precisa ser deliberada, não só técnica.

**Baixo**
- Formulário preenchido mas não submetido (CV+vaga digitados, sem clique em "Analisar") não tem nenhuma persistência hoje — se o usuário atualizar a página antes de clicar, perde tudo. Preexistente; não piora nem melhora com esta mudança, mas vale mencionar no checklist de aceite se o Paulo quiser cobrir esse caso.

---

## D. Alternativas arquiteturais

### Opção 1 — Autenticar antes de qualquer processamento

Não iniciar `AnalysisJob`/chamada de IA até o usuário estar autenticado.

- Complexidade: média — requer separar "persistir CV+vaga" (que já existe como `AnalysisCvSnapshot`) de "disparar processamento" (hoje acoplados em `startGuestAnalysisJob`).
- Risco: baixo a médio — não introduz nada novo estruturalmente, só reordena uma chamada existente.
- Reaproveitamento: alto — `AnalysisCvSnapshot` (persistência de CV com storage+TTL de 30 dias) e `validateAndClaimSnapshot` (transação com proteção anti-duplicidade) já existem prontos.
- Impacto no banco: nenhuma migration estritamente necessária — no máximo um status adicional (opcional) para diferenciar "snapshot aguardando auth" de "job em processamento".
- Impacto em analytics: `analysis_started` passa a significar exatamente "processamento real aceito" — coerente com a recomendação do próprio plano de analytics em paralelo.
- Impacto em UX: nenhum custo de IA desperdiçado em quem abandona o cadastro; ao voltar do OAuth, pode haver um pequeno delay de processamento (perceptível, mitigável com skeleton/loading).

### Opção 2 — Continuar processando guest, bloquear resultado (= comportamento atual, hoje já é isso)

Manter `analyze-guest` disparando `processAnalysisJob` imediatamente (como já acontece), e apenas remover toda superfície de UI/API que expõe o resultado a não autenticado.

- Complexidade: baixa — é a mudança de menor risco técnico, pois não toca no pipeline de IA/proteção, só na camada de exposição.
- Risco: baixo tecnicamente, mas **não resolve o objetivo de custo** (a IA já roda para todo guest, inclusive quem nunca volta para logar) — isso já é o comportamento de hoje, então não é uma regressão, mas também não é uma melhoria.
- Reaproveitamento: total — quase zero mudança de backend.
- Impacto no banco: nenhum.
- Impacto em analytics: nenhuma mudança de timing dos eventos backend; só o frontend deixa de emitir `analysis_result_viewed` para guest.
- Impacto em UX: melhor performance percebida (resultado pode já estar pronto quando o usuário volta do OAuth), mas paga IA por descarte.

### Opção 3 — Persistir apenas inputs, iniciar análise após OAuth

Igual à Opção 1, mas enunciada de forma mais explícita: o clique em "Analisar" grava `AnalysisCvSnapshot` (reaproveitando o código de persistência que hoje já roda dentro de `startGuestAnalysisJob`, mas sem chamar `processAnalysisJob`). Um identificador do snapshot atravessa o OAuth via cookie httpOnly, no mesmo padrão de `oauth_signup_ctx`/`oauth_journey_sid`. No callback (ou no primeiro carregamento autenticado), dispara-se o processamento real.

- Complexidade: média.
- Risco: baixo a médio — maior parte é reaproveitamento; o ponto novo é decidir onde/quando disparar o processamento (no próprio callback do backend vs. no primeiro request autenticado do frontend).
- Reaproveitamento: alto — mesmo aproveitamento da Opção 1 (tecnicamente é a mesma opção, só com ênfase diferente do enunciado do usuário).
- Impacto no banco: nenhuma migration obrigatória.
- Impacto em analytics: mesmo benefício da Opção 1.
- Impacto em UX: mesmo trade-off da Opção 1 (delay perceptível ao voltar do OAuth).

**Nota**: dado o código real, Opção 1 e Opção 3 são a mesma arquitetura descrita de duas formas — ambas dependem de desacoplar "persistir snapshot" de "disparar `processAnalysisJob`", algo que hoje está unido em `startGuestAnalysisJob`. A partir daqui este documento as trata como uma só ("Opção 1/3").

---

## E. Arquitetura recomendada

**Opção 1/3: persistir `AnalysisCvSnapshot` no clique, exigir autenticação antes de disparar `processAnalysisJob`, propagar o `analysisCvSnapshotId` através do OAuth em cookie httpOnly, e auto-disparar a análise assim que autenticado.**

Por quê, com base no código:

1. `AnalysisCvSnapshot` já persiste **tudo** que é necessário (texto do CV, arquivo original em storage, texto da vaga vem em `AnalysisJob.jobDescriptionText` — ver nota abaixo) de forma independente de `userId`, com TTL de 30 dias para guest. Não é preciso inventar uma nova entidade "draft".
2. `validateAndClaimSnapshot` já é transacional e já protege contra: reclamar snapshot de outro dono, sessão guest com hash divergente, snapshot expirado, e claim duplicado (idempotente via `claimedByUserId`). É exatamente o mecanismo de "vínculo atômico" que a seção 4 do prompt original pergunta se existe — existe.
3. O padrão de cookie httpOnly de curta duração escopado a `/api/auth/google` (`oauth_signup_ctx`, `oauth_journey_sid`, `oauth_visitor_id`) já resolve exatamente o problema de "que identificador sobrevive ao OAuth e como" — só precisa de um quarto cookie no mesmo molde, nunca na URL.
4. Evita gastar custo de IA em visitantes que nunca completam o cadastro — hoje esse custo é sempre pago (Opção 2/status quo), então a Opção 1/3 é uma melhoria real de unit economics, não só de UX.
5. `GuestAnalysisClaimer` já existe como rede de segurança client-side — se o auto-claim no callback falhar por qualquer razão, o usuário ainda cai no dashboard e o componente existente tenta reclamar de novo. Isso reduz o risco de "ponto único de falha" no callback.

**Nota sobre `jobDescriptionText`**: hoje esse campo vive em `AnalysisJob`, não em `AnalysisCvSnapshot`. Para a Opção 1/3, é preciso decidir se: (a) `AnalysisJob` passa a ser criado no clique também (com um novo status tipo `pending_auth`, sem disparar `processAnalysisJob`), ou (b) a descrição da vaga migra para dentro do `AnalysisCvSnapshot`/um novo campo leve. **A opção (a) é mais barata**: já existe `AnalysisJobStatus` como enum — adicionar um valor novo (`pending_auth` ou reaproveitar `pending` com uma flag `authGateRequired: true`) é uma migration pequena e aditiva, sem afetar linhas existentes. Ver seção I para detalhamento.

---

## F. Novo fluxo proposto

### Guest (sem conta)

```
/adaptar (page.tsx)
  → handleSubmit (guest branch)
  → nova Server Action, ex: persistGuestAnalysisIntent()
  → POST /cv-adaptation/analyze-guest (MODIFICADO: cria AnalysisCvSnapshot + AnalysisJob
      status=pending_auth, ownerKind=guest — NÃO chama processAnalysisJob)
  → resposta: { analysisCvSnapshotId, analysisJobId } (nunca exposto na URL)
  → frontend redireciona para /entrar?ctx=analysis_guest&next=/adaptar/aguardando
  → GoogleAuthButton acrescenta sid, vid, e NOVO snapshotId via cookie httpOnly
      (não query param) antes de /auth/google/start
  → /auth/google/start (middleware grava cookie oauth_analysis_snapshot_id, 10min, httpOnly,
      path /api/auth/google — mesmo padrão dos 3 cookies existentes)
  → Google OAuth (fora do domínio)
  → /auth/google/callback (lê e limpa os 4 cookies)
  → finishSocialLogin (cria/associa User+AuthAccount, transação)
  → NOVO: se snapshotId presente, chama validateAndClaimSnapshot + dispara
      processAnalysisJob (ou enfileira) dentro do mesmo fluxo pós-transação
  → redirect para /auth/social-callback?accessToken=...&refreshToken=...
  → persistAppSession (cookies httpOnly de app)
  → redirect para /adaptar/aguardando?jobId=... (ou direto /adaptar/resultado se já pronto)
  → polling do job (JwtAuthGuard agora aplicável — usuário já está autenticado)
  → /adaptar/resultado (SEM branch de guest — sempre autenticado, sem blur, sem CTA de cadastro)
  → analysis_result_viewed dispara normalmente (agora sempre mode=authenticated)
```

Fallback de resiliência (callback falhou em disparar auto-claim, ou usuário chegou ao dashboard por outro caminho): `GuestAnalysisClaimer` continua existindo, mas passa a operar sobre `analysisCvSnapshotId` guardado em `localStorage` como *ponteiro leve* (não mais o resultado inteiro, já que o resultado não existe até após o auth) — chama `claimGuest`/rota equivalente para retomar o processamento se ainda não disparado.

### Authenticated (já logado)

```
/adaptar (page.tsx)
  → handleSubmit (authenticated branch, inalterado)
  → analyzeAuthenticatedCv() → POST /cv-adaptation/analyze (JwtAuthGuard)
  → startAuthenticatedAnalysisJob → processAnalysisJob (imediato, como hoje)
  → polling → /adaptar/resultado (sem blur, como hoje)
```

Sem mudanças no fluxo autenticado — ele já é o alvo.

---

## G. Mudanças necessárias

### Frontend
- `apps/web/src/app/adaptar/page.tsx`: branch guest do `handleSubmit` deixa de chamar `analyzeGuestCv` (que processa) e passa a chamar uma ação que só persiste + redireciona para `/entrar`.
- `apps/web/src/app/adaptar/resultado/page.tsx`: remover completamente `GuestBlurOverlay`, `GUEST_MOCK_*`, `GUEST_VISIBLE`, e todo branch condicionado a `!isAuthenticated`. A página passa a assumir sessão válida (redirect para login se não autenticado, sem renderizar nada de análise).
- Nova tela intermediária de espera (`/adaptar/aguardando` ou reaproveitar rota existente) para os segundos entre "voltou do OAuth" e "job pronto".
- `google-auth-button.tsx`: nenhuma mudança de query string necessária se o novo identificador for passado por cookie gravado antes da navegação (mesmo padrão do `post_auth_next`).
- `guest-analysis-storage.ts`: reduzir de "guarda resultado inteiro" para "guarda só o ponteiro (`analysisCvSnapshotId`) como rede de segurança" ou remover, dependendo de quanto o auto-claim no callback for confiável.

### Backend
- `cv-adaptation-public.controller.ts` / `cv-adaptation.service.ts`: separar `startGuestAnalysisJob` em duas etapas — persistir snapshot+job em estado não processado, e um segundo método (chamado só após autenticação confirmada) que dispara `processAnalysisJob`.
- `getAnalysisJobStatus`: fechar a brecha do "caso raro sem `userId` nem `guestSessionHash`" (`isOwner = true`) — deve negar por padrão, nunca permitir.
- Novo endpoint ou extensão do fluxo de callback para "reclamar e iniciar" (`claim-and-start` ou reaproveitar `claim-guest` com uma flag).

### Auth/OAuth
- `oauth-signup-context.ts`: adicionar captura/leitura/limpeza de um 4º valor (`analysisCvSnapshotId` ou `analysisJobId`), mesmo padrão dos 3 existentes — validação de formato (cuid), TTL 10 min, `httpOnly`, `path: /api/auth/google`.
- `auth.controller.ts` (`googleCallback`) e/ou `auth.service.ts` (`finishSocialLogin`): disparar claim+start pós-transação de criação de usuário.
- Considerar adicionar tratamento de erro no callback (redirect para `/entrar?error=oauth_failed` em vez de 401 cru) — não estritamente necessário para o objetivo da mudança, mas a UX piora mais sem isso porque agora o usuário chega ao OAuth com mais investimento feito.
- Considerar reativar `state` no `GoogleStrategy` — risco preexistente, não criado por esta mudança, mas vale avaliar já que o callback ganha mais responsabilidade (vincular análise a conta).

### Banco
- Provavelmente **nenhuma migration obrigatória** para a arquitetura mínima (reaproveitando `AnalysisJob`/`AnalysisCvSnapshot` como estão).
- Se optar por diferenciar explicitamente "aguardando auth" de "pronto para processar" no nível de dado (recomendado para observabilidade), adicionar um valor ao enum `AnalysisJobStatus` (hoje `pending|processing|succeeded|failed`) — aditivo, baixo risco, precisa `npm run railway:touch-api` conforme convenção do projeto.

### Analytics
- Ver seção acima sobre sobreposição com `specs/analytics-v2-saneamento-evolucao-plan.md`. Recomendação: **não implementar analytics desta mudança isoladamente** — coordenar com aquele plano antes, especialmente a redefinição de `analysis_started` (mudança de "job aceito" para "processamento pós-auth aceito") e o novo estágio implícito entre `analyze_submit_clicked` e `analysis_started` (o tempo em OAuth).
- `analysis_result_viewed` deixa de ter slice `mode: guest` — não requer mudança de código, é consequência natural.
- Nenhum evento existente muda de nome ou ownership nesta mudança especificamente (obedecendo à restrição do usuário).

### Segurança
- Fechar a brecha de `getAnalysisJobStatus` mencionada acima.
- Garantir que o novo identificador nunca trafegue em URL (só cookie httpOnly), consistente com o padrão já usado para `ctx`/`sid`/`vid`.
- Reforçar `validateAndClaimSnapshot` como o único caminho de vínculo — não criar um segundo caminho de claim para essa mudança.

### Testes
Ver seção J (matriz de testes).

---

## H. Código que pode ser removido/simplificado

| Item | Classificação | Observação |
|---|---|---|
| `GuestBlurOverlay` + `GUEST_MOCK_*` (`resultado/page.tsx`) | Remover | Só existe para mascarar resultado de guest; sem guest visível, não faz sentido |
| Branch `!isAuthenticated` inteiro em `resultado/page.tsx` | Remover | Página passa a assumir sempre autenticado |
| CTA "cta_signup_click" / link `/entrar?ctx=analysis_guest&autoSave=1` a partir do resultado | Remover | O gate passa a acontecer antes da análise, não depois |
| `saveGuestPreview` (fluxo de auto-save pós-login no resultado) | Simplificar/reavaliar | Pode virar redundante se o auto-claim no callback já cobrir o caso; manter como fallback é aceitável |
| `claimGuestAnalysis` / `POST /cv-adaptation/claim-guest` | Investigação adicional | Hoje usado só em `handleUseCredit` (uso de crédito), não no claim principal — confirmar se continua necessário nesse outro fluxo antes de tocar |
| `guest-analysis-storage.ts` (armazenar resultado inteiro) | Simplificar | Reduzir para guardar só um ponteiro leve (id do snapshot), não o payload de resultado |
| `GuestAnalysisClaimer` | Manter/reutilizar | Vira rede de segurança para quando o auto-claim no callback falha |
| Cookies `oauth_signup_ctx`/`oauth_journey_sid`/`oauth_visitor_id` | Manter | Sem mudança — só ganham um quarto vizinho |
| Testes `page.keyword-lock.spec.ts` (menções a "guest-view flicker") | Investigação adicional | Pode precisar de ajuste ou remoção da parte específica de guest |

**Nada deve ser deletado nesta etapa** — esta seção é só a lista de candidatos, conforme pedido.

---

## I. Plano de implementação por fases

**Fase 0 — Baseline e testes de regressão**
Rodar a suíte atual relacionada (listada na seção J) e confirmar que passa antes de qualquer mudança. Nenhuma mudança de código.

**Fase 1 — Backend: desacoplar persistência de disparo**
Separar `startGuestAnalysisJob` em "criar snapshot+job sem processar" e "disparar processamento". Sem mudar comportamento do endpoint público ainda (feature-flagado, atrás de kill-switch — ver seção K). Testes unitários novos para as duas metades.

**Fase 2 — OAuth: quarto identificador + auto-claim**
Adicionar `analysisCvSnapshotId`/`analysisJobId` ao padrão de cookies httpOnly do OAuth. Implementar auto-claim+start no callback, reaproveitando `validateAndClaimSnapshot`. Testes de integração: guest→OAuth→análise dispara pós-login.

**Fase 3 — Frontend: gate antes do processamento**
Alterar `handleSubmit` em `/adaptar` para o novo branch guest. Nova tela de espera pós-OAuth. Ainda **sem remover** o preview borrado (feature flag controla qual caminho é usado).

**Fase 4 — Remoção do preview guest**
Remover `GuestBlurOverlay`/mocks/branch guest de `resultado/page.tsx`. Este é o passo que efetivamente elimina a exposição de resultado a não autenticado — fazer por último, depois que fases 1-3 estiverem validadas em produção atrás de flag.

**Fase 5 — Fechamento de segurança**
Corrigir a brecha de `getAnalysisJobStatus` (`isOwner = true` no caso sem userId/hash). Avaliar `state` no OAuth. Avaliar tratamento de erro no callback.

**Fase 6 — Cleanup**
Simplificar/remover `guest-analysis-storage.ts` (resultado completo → ponteiro), reavaliar `saveGuestPreview` vs. novo fluxo, atualizar `AGENTS.md`.

Cada fase deve rodar `npm run check && npm run build && npm run test` no escopo tocado antes de prosseguir, conforme convenção do projeto.

---

## J. Plano de rollback

- Manter toda a mudança atrás de um flag de configuração único (reaproveitar o padrão já existente em `analysis-config.service.ts`/`AnalysisProtectionConfig`, que já suporta modos `observe-only|soft-block|hard-block` com audit trail) — algo como `guestPreviewDisabled: boolean`.
- Com o flag desligado, o sistema volta ao comportamento atual (processa guest imediatamente, mostra preview borrado) **sem reverter commits nem migration** — só toggling de config, igual ao mecanismo de kill-switch que o `analysis-protection` já usa.
- Se uma migration de enum for aplicada (novo valor em `AnalysisJobStatus`), ela é aditiva e não precisa ser revertida para desligar o flag — o valor novo simplesmente não é usado enquanto o flag estiver desligado.
- Rollback de UI: manter o componente `GuestBlurOverlay` no código (não deletar) durante as fases 1-4, condicionado ao mesmo flag, até haver confiança suficiente para remover de fato na Fase 4/6.

---

## K. Checklist de aceite (teste manual antes de produção)

1. Guest preenche CV+vaga, clica em "Analisar" → é redirecionado para tela de login/cadastro **sem** ver nenhum resultado, nem parcial.
2. Guest escolhe Google → completa OAuth → volta autenticado → análise inicia ou já está pronta → vê resultado completo, sem blur.
3. Guest escolhe cadastro por email/senha → mesmo resultado do item 2.
4. Usuário que já tem conta mas estava deslogado → mesmo resultado do item 2 (login em vez de signup).
5. Usuário autenticado desde o início → fluxo idêntico ao atual, sem regressão perceptível.
6. Cancelar o OAuth no meio (negar permissão no Google) → volta para uma tela de erro amigável, não um JSON cru; CV/vaga preenchidos não são perdidos (pode tentar de novo).
7. Atualizar a página (F5) depois de clicar em "Analisar" mas antes de completar login → não perde a vaga preenchida (ou, no mínimo, falha de forma clara, sem estado quebrado).
8. Abrir duas abas, iniciar análises diferentes em cada uma, completar OAuth em uma delas → a análise certa é vinculada à conta certa (não há cross-contaminação).
9. Duplo clique no CTA "Analisar" → não cria duas `AnalysisCvSnapshot`/`AnalysisJob` duplicadas nem duas idas ao OAuth.
10. Acessar diretamente uma URL de resultado de análise (job id conhecido) sem estar autenticado → nunca retorna conteúdo, sempre nega.
11. Acessar resultado de análise de outro usuário estando autenticado → nunca retorna conteúdo alheio.
12. `signup_completed`, `analysis_started`, `analysis_completed`, `analysis_result_viewed` continuam aparecendo no PostHog com os campos de sempre (`visitor_id`, `sessionInternalId`, `conversion_context`) — sem duplicidade após o round-trip OAuth.
13. Flag de rollback desligado → sistema volta a mostrar preview borrado como hoje, sem erro.
