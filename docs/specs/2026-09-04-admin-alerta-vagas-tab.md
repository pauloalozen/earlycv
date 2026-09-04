# Admin: aba "Alerta de Vagas" — plano de implementação

**Data:** 2026-09-04
**Status:** implementado e verificado (2026-09-04) — migration aplicada em local/homolog, backend e frontend prontos, 167 testes verdes, página testada de ponta a ponta contra dados reais do homolog (sem mock).
**Mockup:** https://claude.ai/code/artifact/905a1468-1946-44e0-a705-3e31b4521731

## Bug pré-existente encontrado e corrigido durante a verificação

Ao testar `/admin/alerta-vagas` contra a API local, `GET
/admin/monitor/alert-preference/tracked?limit=20` (e qualquer outro
endpoint deste controller com query param) devolvia
`{"message":["property limit should not exist"]}` — **inclusive nos
endpoints antigos** (`/admin/monitor/users?limit=1` já quebrava do mesmo
jeito). Causa raiz: todos os DTOs deste controller eram importados com
`import type` (`import type { ListAdminMonitorUsersDto } from ...`); com
`emitDecoratorMetadata`, o TypeScript só consegue emitir o metadado
`design:paramtypes` que o `ValidationPipe` global (`main.ts`) usa pra
saber contra qual classe validar quando a classe é referenciada como
**valor** em tempo de execução — `import type` apaga essa referência, e
o Nest acaba validando contra `Object` (zero propriedades conhecidas),
rejeitando todo mundo via `forbidNonWhitelisted`.

Corrigido em `admin-monitor.controller.ts`: todos os imports de DTO
viraram imports de valor. O biome tenta "corrigir" isso de volta pra
`import type` (regra `lint/style/useImportType`, que não sabe da
exigência de metadata do Nest) — por isso há um bloco
`biome-ignore-start/end lint/style/useImportType` em volta desses
imports, com o motivo documentado no comentário acima do bloco.

**Isso não é exclusivo deste controller** — qualquer outro controller do
`apps/api` que importe um DTO de `@Query()`/`@Body()` via `import type`
tem o mesmo problema, silenciosamente. Vale um grep por
`^import type.*Dto` nos controllers da API numa sessão futura pra
mapear o alcance real; não fiz essa varredura completa aqui pra não
expandir o escopo desta entrega.

## Follow-up (2026-09-04): menu real do admin + split Monitor/Alerta

Dois problemas descobertos depois da primeira entrega, ambos corrigidos:

1. **O item de menu nunca apareceu.** O menu visível de `/admin` é
   `NAV_ITEMS` (hardcoded) em `admin/_components/admin-topbar.tsx`,
   renderizado por `AdminTopbar` — não `admin-users-operations.ts`
   (`getAdminNavItems()`/`AdminSidebar`), que é código morto (zero
   imports em todo o app). A primeira entrega editou o arquivo errado.
   Corrigido: "Radar · Matching" (`/admin/monitor`) e "Alerta de Vagas"
   (`/admin/alerta-vagas`) adicionados em `admin-topbar.tsx`, logo
   depois de "Radar Oportunidades". Ver
   [[feedback-admin-nav-correct-location]].
2. **`/admin/monitor` e `/admin/alerta-vagas` se sobrepunham** — as duas
   mostravam `MonitorDigest`/`MonitorDigestEvent`. A pedido do Paulo,
   tudo que é sobre e-mail do digest saiu do Monitor e foi pra Alerta de
   Vagas:
   - Novo método `AdminMonitorService.getDigestEmailStats()` (endpoint
     `GET /admin/monitor/digest/stats`) reúne contagem de `MonitorDigest`
     por status, enviados/delivered/opened/clicked/bounced/complained
     (24h) e a lista de digests FAILED — antes espalhado entre
     `getOverview()` e `getFailures()`.
   - `getOverview()`/`getFailures()` do Monitor voltaram a ser só sobre
     matching (perfil, recomendação, `MonitorMatchJob`,
     `MonitorProfileMatchJob`) — sem nada de `MonitorDigest`.
   - `/admin/alerta-vagas` ganhou os números de 24h + contagem por
     status na seção "Histórico de envios", e um botão "Reenviar" nas
     linhas FAILED (reaproveita `AdminMonitorService.resendDigest`, já
     existente).
   - `/admin/monitor` foi renomeada pra "Radar" (eyebrow)/"Diagnóstico
     de matching" (título) — o nome "Monitor" não fazia mais sentido
     depois do split.

## Follow-up 2 (2026-09-04): Matching virou aba de Ingestão

A pedido do Paulo, o diagnóstico de matching saiu do menu principal e
virou uma aba dentro de "Radar Oportunidades" (`/admin/ingestion`),
entre "Indexação de vagas" e "Jobs" — `?tab=matching`. Implementação:
conteúdo extraído pra `admin/ingestion/_components/matching-tab-content.tsx`
(`MatchingTabContent`, recebe `token`/`userQuery`/`jobQuery`/
`redirectPath`/`hiddenFields`), reaproveitado tanto pela nova aba quanto
pela rota standalone `/admin/monitor` (que continua funcionando, só não
está mais no menu — links antigos não quebram). `hiddenFields={{tab:
"matching"}}` garante que os formulários GET de busca (usuário/vaga)
não percam a aba ativa ao submeter.

## Objetivo

Nova aba `/admin/alerta-vagas` no painel admin pra gestão operacional do Alerta
de Vaga Certa (Monitor), com 4 blocos:

1. **Elegibilidade e disparo manual** (seção única — ver decisão abaixo) —
   disparo funcional nesta entrega, elegibilidade manual não. A tabela
   **não lista todos os usuários** (a base de candidatos pode ter
   milhares de linhas irrelevantes pra essa tela) — lista quem já tem uma
   `MonitorAlertPreference` (ou seja, já mexeu na própria preferência de
   alerta, ou foi incluído aqui por um admin). Um controle **"+ Incluir
   usuário"** (busca por nome/e-mail, reaproveitando
   `searchAdminMonitorUsers`) traz qualquer usuário cadastrado pra essa
   lista — **funcional**: cria a `MonitorAlertPreference` dele com
   frequência padrão (`DAILY`) se ainda não existir. Cada linha mostra
   papel, elegibilidade hoje (`JOBS_GHOST_MODE` + `internalRole`, real),
   **frequência** (a preferência do usuário, só leitura nesta tela — quem
   edita é o próprio usuário) e um botão **"Disparar agora"** que envia o
   digest desse usuário na hora (sem esperar o worker de 30s), síncrono,
   **usando a frequência já configurada pra ele** — nunca uma frequência
   escolhida avulsa no disparo. Desabilitado quando o usuário não é
   elegível hoje ou está com o alerta desligado (`frequency: OFF`). A
   coluna "Liberação manual" (toggle) é só visual, desabilitada, com pill
   "em breve" — acesso real continua 100% decidido por
   `MonitorEntitlementService`, sem mudança nenhuma nele nesta entrega.
2. **Histórico de envios** — funcional. Lista paginada de todos os digests
   já processados (manuais e automáticos): data/hora, usuário, forma de
   envio, frequência, status.
3. **Agendamento dos disparos automáticos** — funcional. Editar o horário
   de geração do digest diário e o dia da semana do digest semanal, hoje
   hardcoded em `@Cron(...)`.
4. **Conteúdo do e-mail** — funcional. Editar assunto e texto de introdução
   do digest, hoje hardcoded em `monitor-digest-email.service.ts`.

**Decisão de design (ajustada a pedido do Paulo):** a primeira versão do
mockup tinha um seletor de usuário + dropdown de frequência solto num
bloco "Disparo manual" separado. Isso não fazia sentido — frequência é um
atributo do usuário (a cadência que ele configurou), não uma escolha do
disparo pontual, que é sempre único. A correção: o disparo manual virou
uma ação por linha dentro da própria tabela de elegibilidade, usando a
frequência já cadastrada do usuário — sem dropdown, sem campo de e-mail
livre, sem selecionar frequência avulsa.

Restrição confirmada com o Paulo: disparo continua **só pra admin**
(nenhuma mudança de superfície pública), e o disparo manual precisa ser
**síncrono** (a requisição HTTP só retorna depois que o e-mail foi
efetivamente enviado).

## O que já existe (não mexe)

- `MonitorEntitlementService` (`apps/api/src/monitor/monitor-entitlement.service.ts`)
  decide acesso via `JOBS_GHOST_MODE` + `internalRole`. Ponto único de
  decisão, comentário no código já reserva os motivos `"manual_override"` e
  `"trial"` pra quando essa regra de negócio existir — é aí que a liberação
  manual por usuário vai plugar no futuro.
- `MonitorDigestContentService` monta as recomendações elegíveis pra um
  digest.
- `MonitorDigestEmailService.sendDigest(digestId)` compõe assunto/texto/HTML
  e chama `EmailDeliveryPort.send(...)`.
- `apps/api/src/scripts/trigger-monitor-digest.ts` já faz o disparo manual
  síncrono via CLI (cria o digest e chama `sendDigest` direto, sem passar
  pelo worker). É a lógica a reaproveitar no endpoint admin.
- `admin-monitor.controller.ts` / `.service.ts` / `.module.ts` — módulo
  admin do Monitor já existe, com padrão de guard
  (`JwtAuthGuard` + `RolesGuard` + `@InternalRoles("admin", "superadmin")`)
  e audit log (`MonitorAdminActionLog`) prontos pra reaproveitar.
- Frontend: padrão de página admin (`AdminPageWrap`, `AdminShellHeader`,
  `AdminTable`/`Th`/`Td`, `AdminPill`, `AdminFilterBar`, tokens `AT`),
  autenticação via `getBackofficeSessionToken()` + `admin-monitor-api.ts`
  (`apiRequest`), mutações via server actions (`admin/monitor/actions.ts`)
  com `<form action={...}>` + `revalidatePath`.

## O que precisa ser criado

### Schema (packages/database/prisma/schema.prisma)

1. **`MonitorDigestScheduleConfig`** — linha única (singleton, `id` fixo tipo
   `"default"`), campos: `dailyHour Int`, `dailyMinute Int`,
   `weeklyDayOfWeek Int` (0=domingo...6=sábado, consistente com
   `getUTCDay()` já usado em `isWeeklyDigestDay`), `timezone String
   @default("America/Sao_Paulo")`, `updatedAt`, `updatedByAdminId String?`.
   Guardar hora em timezone local (não UTC) pra edição ficar legível no
   admin; converter pra UTC no momento de decidir se o cron deve disparar.
2. **`MonitorDigestEmailContent`** — linha única (singleton), campos:
   `subject String`, `introText String`, `updatedAt`, `updatedByAdminId
   String?`. Sem versionamento nesta entrega (fica pra depois se precisar
   de histórico/rollback).
3. Ambas as tabelas nascem com uma migration que já insere a linha default
   com os valores hoje hardcoded (11:00 America/Sao_Paulo diário, segunda
   pro semanal; assunto/introText copiados literalmente do que está em
   `monitor-digest-email.service.ts` hoje) — **zero mudança de
   comportamento no dia do deploy**, só passa a ser editável depois.
4. Seguir a convenção do repo: rodar `npm run railway:touch-api` e
   commitar o `.railway-redeploy` junto com a migration.
5. **Entitlement**: nenhuma mudança de schema nesta entrega — a coluna de
   liberação manual por usuário fica só na UI (não funcional), então não
   precisa de `MonitorAlertPreference.manualOverride` ainda. Documentar
   aqui que esse é o próximo passo natural quando a regra de negócio for
   definida.
6. **`MonitorDigest`**: adicionar `source MonitorDigestSource @default(SCHEDULER)`
   (`enum MonitorDigestSource { SCHEDULER ADMIN_MANUAL }`) e
   `triggeredByAdminId String?` — é o que distingue "manual · admin" de
   "automático" no histórico e permite auditar quem disparou. Default
   `SCHEDULER` preserva os registros existentes sem precisar de backfill.

### Backend (apps/api)

Estender `admin-monitor` (não criar módulo novo — mesma área de domínio,
mesmo guard, mesmo audit log):

- `GET /admin/monitor/alert-preference/tracked?page=&pageSize=&userQuery=`
  Lista paginada de usuários que já têm `MonitorAlertPreference` (join
  `user`), com papel, elegibilidade calculada via
  `MonitorEntitlementService` e a frequência. É a fonte da tabela de
  "Elegibilidade e disparo manual" — **não** é uma busca sobre a base
  inteira de usuários.
- `POST /admin/monitor/alert-preference/track`
  Body: `{ userId: string }`. Cria a `MonitorAlertPreference` do usuário
  com `frequency: "DAILY"`, `emailEnabled: true` se ainda não existir
  (idempotente — se já existir, não altera nada e só confirma). É o que
  o botão "+ Incluir usuário" chama; usa a mesma busca de usuário
  (`searchAdminMonitorUsers`) já existente pra encontrar quem incluir.
  Logar em `MonitorAdminActionLog` (`action: "alert_preference_tracked"`).
- `POST /admin/monitor/digest/send-now`
  Body: `{ userId: string }` — **sempre `userId`, nunca e-mail nem
  frequência escolhidos avulsos**. O e-mail de envio é lido do cadastro do
  usuário no momento do disparo; a frequência é lida de
  `MonitorAlertPreference.frequency` do próprio usuário (se `OFF`, o
  endpoint recusa com 422 e a UI já desabilita o botão antes de chamar).
  Lógica: reaproveitar `trigger-monitor-digest.ts` (resolver usuário por
  id, checar entitlement com `MonitorEntitlementService` — **admin ainda
  precisa ser elegível pra receber**, ler a frequência do
  `MonitorAlertPreference` dele, apagar digest existente do período se
  houver, montar recomendações via `MonitorDigestContentService`, criar o
  `MonitorDigest` com `source: "ADMIN_MANUAL"` e `triggeredByAdminId` do
  admin autenticado, chamar `MonitorDigestEmailService.sendDigest(digest.id)`
  e **aguardar** o resultado antes de responder). Retorna status final
  (enviado / falhou + motivo) pra UI mostrar o pill de resultado. Logar em
  `MonitorAdminActionLog` (`action: "digest_manual_send"`).
- `GET /admin/monitor/digest/history?page=&pageSize=&userQuery=&source=`
  Lista paginada de `MonitorDigest` (join `user`, ordenado por
  `scheduledFor`/`sentAt` desc), retornando data/hora, usuário (nome +
  e-mail), `source` (manual/automático — e "manual · admin" mostra o nome
  de quem disparou via `triggeredByAdminId`), frequência e status. Filtros
  opcionais por nome/e-mail do usuário e por `source`. Paginação padrão
  (mesmo shape usado em `admin-monitor.service.ts` pras outras listagens
  paginadas do módulo, pra reaproveitar o componente de paginação do
  frontend).
- `GET /admin/monitor/digest/schedule` / `PUT /admin/monitor/digest/schedule`
  Lê/grava `MonitorDigestScheduleConfig`. Validar hora (0-23), minuto
  (0-59), dia da semana (0-6) via DTO com `class-validator`. Logar
  `action: "digest_schedule_updated"`.
- `GET /admin/monitor/digest/content` / `PUT /admin/monitor/digest/content`
  Lê/grava `MonitorDigestEmailContent`. Validar tamanho de assunto (evitar
  string vazia / absurdamente longa). Logar `action: "digest_content_updated"`.
- Todos os 8 endpoints com o guard padrão do módulo
  (`JwtAuthGuard` + `RolesGuard` + `@InternalRoles("admin", "superadmin")`).

**Scheduler dinâmico** (a parte de maior risco técnica):

- `monitor-digest.scheduler.ts` hoje usa `@Cron("0 14 * * *")` estático.
  Pra virar configurável sem reiniciar o serviço, trocar por
  `SchedulerRegistry` do NestJS: registrar o cron job em runtime lendo
  `MonitorDigestScheduleConfig` no boot, e re-registrar
  (`schedulerRegistry.deleteCronJob` + `addCronJob`) sempre que o endpoint
  `PUT /schedule` gravar um novo valor — assim a mudança feita no admin
  vale sem precisar de redeploy.
- Alternativa mais simples (e mais segura pra primeira versão): manter o
  `@Cron` fixo rodando a cada minuto (baixo custo, já existe padrão
  parecido no worker de 30s) e, dentro do handler, comparar
  hora/minuto/dia atual (na timezone configurada) contra
  `MonitorDigestScheduleConfig` antes de decidir se dispara. Mais simples
  de revisar, sem risco de `SchedulerRegistry` bugar o boot do serviço —
  **recomendado pra essa entrega**, com a versão `SchedulerRegistry`
  como melhoria futura se o time achar o polling por minuto insatisfatório.
- `isWeeklyDigestDay` e `startOfUtcDay`/`startOfIsoWeekUtc` em
  `monitor-digest-schedule.util.ts` precisam aceitar a config em vez de
  constante hardcoded — assinatura passa a receber `MonitorDigestScheduleConfig`
  como parâmetro.
- `monitor-digest-email.service.ts`: `buildHtml`/texto/assunto passam a
  ler `subject`/`introText` de `MonitorDigestEmailContent` (buscar 1x por
  chamada de `sendDigest`, sem cache pra manter simples) em vez das
  constantes inline hoje nas linhas ~104-123 e ~159-217.

### Frontend (apps/web)

- Nav: adicionar item em `apps/web/src/lib/admin-users-operations.ts`
  (`{ href: "/admin/alerta-vagas", label: "Alerta de Vagas", section:
  "ingestion" }`), mesma seção do resto do Monitor/Radar.
- Rota: `apps/web/src/app/admin/alerta-vagas/page.tsx` (server component,
  `getBackofficeSessionToken()` + `AdminTokenState` no caminho sem token,
  `buildAdminMetadata("Alerta de Vagas")`), seguindo a estrutura do mockup:
  `AdminShellHeader` + 4 seções (`Elegibilidade e disparo manual`,
  `Histórico de envios`, `Agendamento`, `Conteúdo do e-mail`) usando os
  primitivos de `admin-primitives.tsx`.
- `apps/web/src/lib/admin-monitor-alert-api.ts` (novo lib, mesmo padrão de
  `admin-monitor-api.ts`: `resolveToken` + `apiRequest`) com funções
  `getTrackedAlertUsers`, `trackAlertUser`, `sendMonitorDigestNow`,
  `getMonitorDigestHistory`, `getMonitorDigestSchedule`,
  `updateMonitorDigestSchedule`, `getMonitorDigestContent`,
  `updateMonitorDigestContent`.
- `apps/web/src/app/admin/alerta-vagas/actions.ts` (`"use server"`) —
  server actions que chamam o lib acima e fazem `revalidatePath`,
  seguindo `admin/monitor/actions.ts` como referência (formulário simples
  com `<form action={...}>`, sem client-side state).
- Seção "Elegibilidade e disparo manual": a tabela é server component,
  paginada via `searchParams` sobre `getTrackedAlertUsers` (não sobre a
  base inteira de usuários). O controle "+ Incluir usuário" **é** um
  client component (único novo da página) — precisa de busca
  incremental via `searchAdminMonitorUsers` — que, na seleção, chama
  `trackAlertUserAction` (server action) e a página revalida mostrando a
  nova linha. Cada linha da tabela traz a frequência
  (`MonitorAlertPreference.frequency`, só leitura) e um
  `<form action={sendDigestNowAction}>` com `userId` num hidden input —
  **nenhum campo de e-mail, nenhum seletor de frequência solto**; o botão
  "Disparar agora" vem `disabled` quando a linha não é elegível hoje ou
  está com `frequency: OFF`. A coluna "Liberação manual" renderiza o
  toggle **sempre desabilitado** (`disabled`, opacidade reduzida) +
  `AdminPill` tone `warn` com texto "em breve" — decorativo até a regra
  de negócio existir.
- Seção "Histórico de envios": server component paginado via
  `searchParams` (`page`, `userQuery`, `source`), usando `AdminTable` +
  `AdminPagination` — mesmo padrão de paginação já usado em outras
  listagens do admin (ver `admin/monitor/page.tsx` pro shape de
  `searchParams` assíncrono).

## Ordem de implementação sugerida

1. Migration + seed dos 2 modelos novos com os valores hardcoded atuais,
   mais o campo `source`/`triggeredByAdminId` em `MonitorDigest` (zero
   risco, não muda comportamento).
2. Endpoints `GET .../tracked` e `POST .../track` (listar quem já tem
   `MonitorAlertPreference` + incluir um novo usuário) + combobox
   "+ Incluir usuário" no frontend — pré-requisito pra ter alguém na
   tabela pra testar o disparo manual.
3. Endpoint de disparo manual síncrono por `userId`, lendo a frequência do
   próprio `MonitorAlertPreference` (reaproveita lógica existente do
   script CLI — menor risco, maior valor imediato pro Paulo testar) +
   botão "Disparar agora" por linha.
4. Endpoint + UI de histórico de envios (só leitura, sem risco — dá pra
   entregar assim que o campo `source` existir).
5. Endpoints + UI de conteúdo do e-mail (leitura/escrita simples, sem
   tocar em scheduler).
6. Endpoints + UI de agendamento, com o `monitor-digest-email.service.ts`
   já lendo o content novo e o scheduler ainda hardcoded.
7. Scheduler passando a ler `MonitorDigestScheduleConfig` (abordagem do
   polling por minuto, não `SchedulerRegistry`, pra reduzir risco).
8. Nav + página admin montando as 4 seções, tabela de elegibilidade com
   o botão "Disparar agora" por linha e o toggle de liberação manual
   sempre desabilitado.

## Testes

- Backend: unit tests dos 8 endpoints novos (guard, validação de DTO,
  happy path); teste do `sendDigest` continuando idêntico quando lê
  subject/introText da config em vez de constante; teste do scheduler
  com config alterada (dispara/não dispara conforme horário mockado).
- Frontend: teste dos server actions (chamam a API certa, fazem
  `revalidatePath`); nenhuma lógica client-side nova além do formulário
  padrão, então sem necessidade de teste de componente pesado.
- Rodar só os módulos tocados por padrão
  ([[feedback-no-auto-full-suite]]) — suíte completa só se pedido.

## Riscos / cuidados (produção com pagantes)

- O disparo manual síncrono **envia e-mail de verdade** pro usuário
  selecionado — sem limite de taxa nem confirmação extra (o vínculo
  obrigatório a um `userId` cadastrado já evita o risco de digitar um
  e-mail errado, mas não evita disparo repetido sem querer). Vale
  considerar uma confirmação simples no frontend antes de disparar.
- Mudar o scheduler de estático pra dinâmico é a parte mais arriscada de
  regressão silenciosa (digest parar de disparar sem erro visível) — por
  isso a recomendação de manter o polling por minuto em vez de
  `SchedulerRegistry` nesta primeira versão, e testar em homolog antes do
  deploy.
- Nenhuma mudança em `MonitorEntitlementService` nesta entrega — a coluna
  de liberação manual na UI é só visual, não decide acesso real. Isso tem
  que ficar claro no PR pra ninguém achar que o feature de liberação por
  usuário já está funcionando.
