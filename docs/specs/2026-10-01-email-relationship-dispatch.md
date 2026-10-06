# E-mails de relacionamento (boas-vindas, feedback) e confirmação de compra

Status: implementado em `develop` (local, não commitado). **Todos os envios reais desligados** (modo `OFF`). Atualizado na 2ª rodada: confirmação de compra, supressão compartilhada lida por Monitor/Product Updates, transporte fake fora de produção, correção do formato do evento `Subscription`, feedback com uma única pergunta.
Ativação: `docs/runbook/email-relationship-activation.md`.

> **Atualização (§11):** modos, cutoff, allowlist e bloqueios **não são mais variáveis de ambiente** (`EMAIL_*_MODE`, `EMAIL_RELATIONSHIP_*`): ficam no banco e são editados em **Admin → Emails → Configurações**. Onde as seções antigas citam essas variáveis, vale o §11. Assunto/corpo dos e-mails também são editáveis (Admin → Emails → Templates).

## 1. Diagnóstico (antes)

- Já existe fachada única `EmailService.send({category, message})` (`apps/api/src/email/`): `DefaultEmailRoutingPolicy` → provider (Resend para `AUTHENTICATION`/`BILLING`; SES para o resto) → `senderProfile` por categoria. A fachada **não persiste nada**.
- Duplicação real: `MonitorDigestWorker` e `ProductUpdateSenderWorker` repetem a mesma máquina de estados (lock, `PENDING→PROCESSING→SENT/FAILED/OUTCOME_UNKNOWN`, PROCESSING travada, `MAX_ATTEMPTS`); três tabelas de entrega quase iguais (`MonitorDigest`, `ProductUpdateDelivery`, `PaymentRecoveryEmail`); Payment Recovery faz `fetch` direto no Resend; templates HTML inline nos services.
- Webhook SES único em `monitor-public.controller.ts`, roteado por tag `correlationType`.
- Descadastro: Monitor usa token HMAC próprio; Product Updates usa SES List Management (`ProductEmailSubscription`).
- Supressão por bounce/complaint era **por domínio** (Monitor e Product Updates marcam `BOUNCED` em *qualquer* bounce, inclusive transitório).
- O Resend ignora `from`/`replyTo` (remetente fixo): "Paulo do EarlyCV" + Reply-To só funciona via SES.

## 2. O que foi feito (escopo desta entrega)

Reaproveitado: fachada `EmailService`, `SesEmailProviderService`, SES List Management, `IngestionLockRepository`, `ses-event.util`, padrão de worker de Product Updates, padrão de modos/allowlist do Payment Recovery.
**Não migrados:** Monitor, Product Updates, Auth (envio de OTP/reset), Payment Recovery.

| Peça | Onde |
|---|---|
| Categoria `RELATIONSHIP` (SES, perfil próprio, **Configuration Set próprio, sem fallback**) | `email/email.types.ts`, `email-config.service.ts` |
| Fila/outbox + worker + eligibilidade + templates + webhook | `apps/api/src/email-dispatch/` |
| Supressão **compartilhada** (bounce *Permanent* + complaint, de qualquer categoria) | `email/email-suppression.service.ts`, alimentada em `monitor/ses-webhook-dispatch.ts` |
| Tópico SES de relacionamento separado do de Product Updates | `email/ses-subscription.util.ts`, `RelationshipEmailPreference` |
| Ganchos | `auth.service.ts` (`verifyEmail`, `finishSocialLogin` só `isNewUser`) |
| Teste explícito | `apps/api/src/scripts/send-relationship-test.ts` (`npm run email:test-relationship -w apps/api`) |
| Migration | `packages/database/prisma/migrations/20261001120000_email_relationship_dispatch` (só `CREATE`, aditiva) |

### Modelo de dados
`EmailDispatch` (outbox, `dedupeKey` único, `expiresAt`), `EmailDispatchEvent` (idempotente por `providerEventId`), `RelationshipEmailPreference` (opt-out do tópico), `EmailSuppression` (por endereço: `HARD_BOUNCE` | `COMPLAINT`).

## 3. Regras de negócio

### Boas-vindas
- Só **depois do e-mail verificado**: senha → `verifyEmail()` (nunca `register()`); social → só `isNewUser` (conta pré-existente que apenas vincula o Google **não** recebe).
- Agendada para `agora + 10 min`; expira em 48h (boas-vindas velha não faz sentido).

### Feedback (uma vez)
- Agendado junto com a boas-vindas: `max(cadastro + 24h, boas-vindas + 12h)`, ajustado à janela **08:00–20:00 de Brasília** (fora dela → próximo 08:00). Caso normal = exatamente cadastro + 24h.
- **Verificação tardia:** quem verifica dias depois do cadastro nunca recebe os dois juntos: o feedback fica ≥12h depois da boas-vindas; no envio ainda espera se a boas-vindas estiver `PENDING/PROCESSING` ou tiver saído há <12h.
- Texto único (template `FEEDBACK_FIRST_USE`). **Não há mais variante viu/neutro** (decisão de 2026-10-01): o cadastro nasce da primeira análise, então o texto pode falar da análise. A coluna `EmailDispatch.variant` ficou sem uso (mantida por ser aditivo).

### Feedback segunda chamada (`FEEDBACK_SECOND_CALL`)
- **Criada pelo worker** quando o primeiro feedback vira **`SENT` de verdade**: `scheduledFor = ajusteJanela(sentAt + 14 dias)`, `expiresAt = scheduledFor + 48h`, dedupe `feedback2:{userId}`, `createMany skipDuplicates`. Pulado/falho/sombra no primeiro = **não há segunda chamada**.
- **Modo próprio** (`feedbackSecondCallMode`, OFF por padrão), com as mesmas regras (cutoff obrigatório, LIVE confirmado). Só nasce se o modo não está OFF **no instante do envio do primeiro**: ligar depois **não** preenche retroativamente quem já recebeu o primeiro.
- Mesma elegibilidade do relacionamento (verificado, não staff, blocklist, cutoff, descadastro, supressão). Adia só pela janela 08–20h BRT (a regra de boas-vindas é só do primeiro). Erro ao criar a linha nunca afeta o envio já concluído (loga `email_dispatch_enqueue_failed kind=FEEDBACK_SECOND_CALL`).
- Texto: o antigo "neutro" (`FEEDBACK_NEUTRAL` renomeado para `FEEDBACK_SECOND_CALL` na migration `20261001180000`; texto salvo no admin, se houver, é preservado).
### Adiado × descartado (nada fica pendente para sempre)
| Situação no momento do envio | Resultado |
|---|---|
| Fora de 08:00–20:00 BRT | **Adia** para o próximo 08:00 (se passar de `expiresAt` → `CANCELLED outside_window_past_expiry`) |
| Boas-vindas pendente / enviada há <12h | **Adia** (mesma regra de prazo) |
| Usuário não encontrado / inativo / e-mail não verificado / staff / bloqueado / antes do cutoff / descadastrado do tópico / hard bounce / complaint | **Descarta** (`SKIPPED` + motivo) |
| Passou de `expiresAt` (feedback: 48h após o horário agendado; welcome: 48h) | `CANCELLED expired` |
| Falha confirmada do provider | 3 tentativas com backoff 15/30 min, depois `FAILED` |
| Timeout/erro ambíguo, ou PROCESSING travada | `OUTCOME_UNKNOWN`, **nunca reenvia** (só resolve por evento do webhook) |
| Infra de envio incompleta | Não envia, não consome tentativa; expira sozinho |

Elegibilidade e preferências são **reavaliadas a cada envio**.

### Preferências, descadastro e supressão
- Tópico **próprio** `relationship` na mesma contact list (`AWS_SES_CONTACT_LIST_NAME`). Descadastrar de Product Updates **não** descadastra de relacionamento (e vice-versa): `resolveTopicSubscriptionChange` só reage à mudança do *seu* tópico (compara `old`/`new` quando o payload traz `oldTopicPreferences`) ou a "cancelar tudo". O handler de Product Updates passou a usar o mesmo helper (comportamento idêntico sem `oldTopicPreferences`).
- `checkSendReadiness` recusa enviar se o tópico de relacionamento for igual ao de Product Updates.
- **Bounce:** só `bounceType = Permanent` suprime. `Transient`/`Undetermined` **nunca**.
- **Complaint:** sempre suprime. Um complaint em qualquer categoria passa a bloquear relacionamento.
- Bounce legado (`MonitorAlertPreference`/`ProductEmailSubscription` = `BOUNCED`) **não é lido** (não dá para distinguir de transitório); complaint legado é lido.
- Limite atual: Monitor/Product Updates ainda **não leem** `EmailSuppression` (não migrados). O SES mantém a suppression list de conta.

### Exclusões
- `paulo.alozen@gmail.com` e `contato@earlycv.com.br`: fixas em `email-dispatch.constants.ts` (não dependem de env). `EMAIL_RELATIONSHIP_BLOCKLIST` só acrescenta. Também ficam de fora `isStaff`/`internalRole != none`.
- Só `sendTest` (script) aceita essas contas, com destinatário informado e sem varrer base.
- **Base antiga nunca recebe:** `EMAIL_RELATIONSHIP_START_AT` (cutoff) vale no enqueue e no envio.

## 4. Atribuição de `analysis_result_viewed` (histórico — NÃO é mais usado no envio)

> Desde 2026-10-01 o feedback não depende desse evento (variante removida). A análise abaixo fica só como registro.

- O evento é emitido pelo **frontend** (`adaptar/resultado/page.tsx`) com `userId: null` nas properties; o `userId` gravado vem do **JWT verificado** no middleware (`request-context.middleware.ts`), então só existe quando a pessoa estava **logada** ao ver o resultado.
- `trackEvent` **não envia nada** sem consentimento de analytics (`consentState` desconhecido/negado) → **ausência do evento não prova que não viu**.
- Visualização como convidado (antes do cadastro) fica sem `userId`; o vínculo guest→usuário existe só indiretamente (`sessionInternalId`) e **não** foi usado.
- `CvAdaptation`/`AnalysisSession` existentes **não** provam visualização (não usados).
- **Decisão original (substituída):** `VIEWED` só com evento com `userId`; senão `NEUTRAL`.

## 5. Remetente e SES

- Não foi possível consultar as identidades SES (sem credenciais/CLI AWS nesta máquina; regra de não tocar produção). Inferido da documentação do repo (`.env.example`): `contato@earlycv.com.br` já é From **e** Reply-To de Product Updates em produção; `vagas@alertas.earlycv.com.br` é o do Alerta. SPF/DKIM/DMARC do domínio validados (`docs/security/security-evidence-2026-05-11.md`).
- **From proposto:** `Paulo do EarlyCV <contato@earlycv.com.br>`, Reply-To `contato@earlycv.com.br`: identidade já usada em produção, nada novo no SES/DNS/caixa. `paulo@earlycv.com.br` só se a identidade for do **domínio** `earlycv.com.br` (confirmar no console).
- **Sem tracking de abertura/clique:** o tracking é do Configuration Set, não por mensagem. Por isso `AWS_SES_RELATIONSHIP_CONFIGURATION_SET` é **obrigatório e diferente** do compartilhado (senão recusa enviar). Configuration Set novo: eventos SEND/DELIVERY/BOUNCE/COMPLAINT/REJECT/SUBSCRIPTION → mesmo tópico SNS; **sem** OPEN/CLICK.
- HTML mínimo (sem imagem/banner) + texto; `{{amazonSESUnsubscribeUrl}}` resolvido pelo SES.

## 6. Medição
- **Entrega/bounce/complaint:** webhook → `EmailDispatchEvent` (+ `EmailDispatch.status`).
- **Abertura/clique:** não coletados (config set sem tracking); Open/Click recebidos seriam ignorados.
- **Resposta:** não há integração com a caixa de contato. Resposta é contada manualmente. Medir automaticamente exigiria SES Receiving/MX (fora do escopo; conflitaria com a caixa atual).

## 7. Evidências de validação
- `tsc --noEmit` (apps/api): limpo. `biome check` nos arquivos tocados: limpo.
- Specs: 258 passam (`email-dispatch/*`, `email/*`, `product-updates/*`, `monitor/ses-webhook-dispatch`, `monitor-public.controller`, webhooks do Monitor, hooks de auth, `admin-product-updates`). Auth com banco (43 testes: `auth.service`, `social-auth`, afiliados, oauth) passa num Postgres descartável com a cadeia completa de migrations.
- Teste de mutação: removendo o check do claim atômico, exatamente os 2 testes de concorrência falham.
- Migration: cadeia completa aplicada em Postgres descartável; `prisma migrate diff` migrations×schema = **"No difference detected"**.
- Postgres real (script descartável, removido): dedupe sob 10 enqueues concorrentes → 1 linha por chave; 2 workers concorrentes → 1 envio; supressão `Permanent` de outra categoria bloqueia relacionamento (`Transient` ignorado); opt-out de relacionamento não afeta Product Updates e é reavaliado no envio; webhook duplicado idempotente; apagar usuário preserva `EmailDispatch` (`userId=null`).
- Não executável aqui: `app.module.spec.ts` (sobe o app inteiro; falha/trava **também no baseline**, anterior a esta mudança). Coberto por `email-dispatch.module.spec.ts` (grafo de DI de `EmailDispatch`+`Auth`+`Monitor`).

## 8. Riscos e pendências
1. `{{amazonSESUnsubscribeUrl}}` em corpo texto/HTML e formato do evento `Subscription` com `oldTopicPreferences` **não validados contra a AWS real** → validar com `send-relationship-test --send` para uma conta sua antes de ligar.
2. Criar na AWS (manual): tópico `relationship`, Configuration Set sem tracking com destino SNS (inclui SUBSCRIPTION).
3. Monitor/Product Updates ainda não leem `EmailSuppression`.
4. Sem confirmação visual dos e-mails em clientes reais (Gmail/Outlook): revisar com o script (dry-run) e um envio de teste.
5. Verificação de e-mail por outros caminhos que não `verifyEmail`/social novo não dispara boas-vindas (por desenho).

## 9. Segunda rodada (2026-10-01)

### 9.1 Confirmação de compra (`PURCHASE_CONFIRMATION`, BILLING/Resend)
- **Todos os caminhos de aprovação** (webhook do Mercado Pago, `applyApprovedPurchase`/reconciliação e `redeemFreeCoupon`) convergem em `PlansService.applyApprovedPurchaseInsideTransaction`; o gancho fica ali, logo depois de os créditos serem aplicados, **dentro da mesma transação**. A trava atômica da aprovação (`updateMany ... WHERE status elegível`) garante 1 execução por compra; `dedupeKey = purchase:{id}` (único) + `createMany skipDuplicates` cobrem qualquer repetição.
- **Falha no enfileiramento nunca impede os créditos:** o insert roda dentro de um `SAVEPOINT`; qualquer erro SQL faz `ROLLBACK TO SAVEPOINT` e a transação de crédito segue e commita. (Sem o savepoint, um erro SQL aborta a transação inteira e os créditos se perdem; confirmado por teste de mutação.) O envio em si é assíncrono (worker), fora da transação.
- **Conteúdo:** snapshot gravado na aprovação (`payloadJson`): plano, valor e moeda da `PlanPurchase` (o webhook já confere valor/moeda pagos contra o pedido antes de creditar), créditos e análises realmente aplicados. Compra paga: "Recebemos o pagamento…", Plano / Valor pago / Créditos adicionados. **Cupom 100%** (`internal_coupon`, valor 0): "Seu cupom foi resgatado… Nenhum pagamento foi cobrado.", **sem** valor pago e sem a palavra "compra" no assunto. Plano ilimitado mostra "Acesso: ilimitado".
- **Regras próprias (recibo, não relacionamento):** não exige e-mail verificado, não respeita descadastro de tópico, blocklist nem staff. Descarta (`SKIPPED`): compra inexistente/de outro usuário/**não mais `completed`** (estornada), compra anterior ao cutoff, endereço com hard bounce/complaint. Sem janela de horário (sai em ~30s). Expira em 24h.
- **Sem descadastro:** `BILLING` → Resend, sem `ListManagementOptions` (transacional). Rastreio: `status`/`providerMessageId` (o Resend não tem webhook de entrega neste código).
- Cutoff: `purchase.createdAt >= EMAIL_RELATIONSHIP_START_AT`: reconciliar/reparar compra antiga nunca dispara e-mail.
- Em produção sem `RESEND_API_KEY` não envia (o módulo cairia em transporte fake e marcaria "SENT" em silêncio).

### 9.2 Supressão compartilhada lida por Monitor e Product Updates (sem migrar workers)
- Monitor: `MonitorDigestEmailService.sendDigest` retorna `email_suppressed` (→ `SKIPPED`) para endereço em `EmailSuppression`, em qualquer `sesMode` (inclusive `LEGACY_RESEND`).
- Product Updates: a seleção de destinatários (`resolveEligibleRecipients`/`countEligibleRecipients`) exclui os endereços suprimidos; `sendToDelivery` rechecha no envio e o worker fecha a delivery como `CANCELLED` (terminal, nunca `FAILED`/reenvio).
- **Descadastros por tópico continuam independentes:** nada disso lê/escreve `MonitorAlertPreference`, `ProductEmailSubscription` ou `RelationshipEmailPreference`; a tabela só guarda hard bounce e complaint.
- **Descoberta importante (documentação da AWS):** enviar para um contato **descadastrado** de um tópico gera um evento `Bounce`. Para esse bounce nunca virar supressão global, `EmailSuppression` só registra `Permanent` com subtipo `General|NoEmail|Suppressed|OnAccountSuppressionList` e ignora diagnóstico que mencione unsubscribe/opt-out/topic/contact list. O formato exato desse bounce **não está documentado**: validar com o passo 3.4 do runbook.

### 9.3 Transporte fake fora de produção
- `EmailDispatchConfigService.isRealTransportAllowed()` = `APP_ENV === "production"`. O worker passa `realTransport` só nesse caso; fora dele (inclusive `ALLOWLIST`) `deliver()` devolve `fake:<id>` sem tocar em provider. Linhas ficam `SENT` com id fake (visível).
- `sendTest`/script: padrão **fake** em qualquer ambiente; real só com `realTransport:true` (`--real-send`), destinatário informado em `--to`, um envio, e a infra completa. `--fake-send` roda o fluxo completo com transporte fake. Dry-run (padrão) não abre banco nem rede.

### 9.4 Correção do formato do evento `Subscription` (achado na documentação oficial)
- `subscription.source` **não é o e-mail do contato**: é o mecanismo (ex.: `"UnsubscribeHeader"`). O contato está em `mail.destination[0]`. O handler de Product Updates (anterior a esta entrega) assumia `source` = e-mail, então **nunca achava o usuário** (descadastro de comunicados via SES não chegava ao banco local). Corrigido para os dois handlers.
- O evento usa `OptIn`/`OptOut` (a API usa `OPT_IN`/`OPT_OUT`): aceitamos as duas grafias. Testes usam o exemplo **exato** da documentação.
- **Ainda não validado contra um evento real da conta** (ver runbook, passo 3).

### 9.5 Feedback com uma única pergunta
- Com visualização comprovada: "O que você achou da análise do seu currículo?" (assunto: "Sobre a análise do seu currículo").
- Neutro: "Como foi sua primeira experiência com o EarlyCV?" (assunto: "Sua primeira experiência no EarlyCV").
- Um `?` por e-mail; assunto não é pergunta.

### 9.6 Evidências
- Specs unitárias: `email-dispatch/*` (inclui `email-dispatch.purchase.spec.ts`), `email/*`, Product Updates e Monitor atualizados.
- **Postgres real** (`plans/plans-purchase-confirmation.spec.ts`, 7 testes via `PlansService` de verdade): `applyApprovedPurchase` (1 crédito + 1 confirmação, repetição não duplica), 6 aprovações concorrentes (1 crédito, 1 e-mail), webhook do MP (inclui reentrega), `redeemFreeCoupon` 100% (confirmação de **resgate**), modo OFF sem linha, compra anterior ao cutoff creditada sem e-mail e **erro SQL real no enqueue → créditos aplicados e compra `completed`**.
- Mutação: removendo o `SAVEPOINT`, exatamente o teste de falha real quebra.
- DI real (`email-dispatch.module.spec.ts`): `PlansService`, Monitor e Product Updates recebem as dependências novas (todas `@Optional`, então a falha de fiação seria silenciosa).

### 9.7 Pendências de configuração AWS (nada executado)
1. Tópico `relationship` (`OPT_IN` por padrão) na contact list existente (`update-contact-list` substitui os tópicos).
2. Configuration Set `earlycv-relationship-email`: destino SNS (mesmo tópico do webhook) com `DELIVERY`, `BOUNCE`, `COMPLAINT`, `SUBSCRIPTION` (+ `SEND`, `REJECT` recomendados), **sem `OPEN`/`CLICK`** e sem `TrackingOptions`.
3. Variáveis `AWS_SES_RELATIONSHIP_*` e `EMAIL_RELATIONSHIP_START_AT` no Railway.
4. Teste real com `--real-send` para uma conta sua (runbook §3): link no texto e no HTML, evento `Subscription` real, bounce de opt-out, ausência de OPEN/CLICK.

## 10. Terceira rodada (pré-publicação)

### 10.1 Transporte fake: configuração e testes
- **Configuração:** `EmailDispatchConfigService.isRealTransportAllowed()` é verdadeiro **somente** com `APP_ENV` exatamente `production` (indefinido, vazio, `development`, `staging`, `homolog`, `test`, `Production `, `prod` → fake). Fora de produção todo modo `LIVE` vira `ALLOWLIST` para os **três** tipos, e `deliver()` com `realTransport=false` devolve `fake:<id>` sem tocar em SES/Resend. O boot loga `transport=real|fake`.
- **Envio real de teste:** só `--real-send` (padrão = dry-run; `--fake-send` = fluxo completo com transporte fake). `parseTestArgs` exige **exatamente um** `--to`, recusa lista/vírgula/`;`/espaço/nome+`<>`/repetido/posicional, `--fake-send`+`--real-send`, `--no-db` fora de `--real-send` ou com `purchase`. `--no-db` envia welcome/feedback sem abrir o banco.
- **Testes:** `email-dispatch.transport.spec.ts` (valores de `APP_ENV`, downgrade dos 3 tipos, 3 tipos `SENT fake:` com 0 chamadas ao provider, log de boot), `email-dispatch-test-args.spec.ts`, `email-dispatch-standalone.spec.ts` (mesma mensagem do fluxo automático, recusa sem infra), mais os de `email-dispatch.service.spec.ts`/`purchase.spec.ts`. Execução manual contra Postgres descartável: `--fake-send` grava `WELCOME|SENT|isTest|fake:`; `--real-send` e `--real-send --no-db` recusados com `not_ready:ses_disabled`; lista de destinatários recusada.

### 10.2 Compra quando o enqueue falha (comportamento final)
Invariante: **créditos e `status=completed` nunca dependem do e-mail.** Cenários:
| Cenário | Créditos / aprovação | E-mail | Observável |
|---|---|---|---|
| Dependência de dispatch ausente (DI quebrada) | corretos | nenhum | `email_dispatch_dependency_missing consumer=PlansService` no boot |
| Modo OFF | corretos | nenhuma linha (zero consulta) | `email_dispatch_boot purchase=OFF` |
| Erro SQL no enqueue (tabela/enum/dado) | corretos: `ROLLBACK TO SAVEPOINT`, a transação de crédito commita | nenhuma linha | `email_dispatch_enqueue_failed kind=PURCHASE_CONFIRMATION purchaseId=… credits_unaffected=true`; depois `purchase_confirmation_missing` |
| Enqueue ok, mas outro passo da MESMA transação falha (ex.: auto-unlock) | revertidos juntos (comportamento já existente; o MP reentrega) | a linha **também** é revertida: nunca existe recibo de compra não creditada | — |
| Commit ok, envio falha | corretos | `FAILED` (3 tentativas) ou `OUTCOME_UNKNOWN` (nunca reenvia) | status da linha |
| Linha perdida (qualquer causa acima) | corretos | recuperada por `email:recover-purchase-confirmations --apply` (≤72h, idempotente) | detecção a cada 10 min, só log |
Provado com Postgres real (`plans-purchase-confirmation.spec.ts`, 11 testes): erro SQL real → créditos aplicados e compra `completed`; perda → detecção → dry-run não muda nada → `--apply` recria 1 linha → repetir não duplica; modo OFF não cria; janela/cutoff/`completed`/cupom 100% respeitados.

### 10.3 Observabilidade (tokens no log do deploy) — ver tabela no runbook §8
Inclui `email_dispatch_boot`, `..._not_ready`, `..._dependency_missing` (Plans, Auth, controller do webhook), `..._enqueue_failed`, `purchase_confirmation_missing`, `email_dispatch_event`, `email_dispatch_subscription`, `email_suppression_decision` (diagnóstico do bounce **sem e-mails**).

### 10.4 Comportamento ativo no deploy, independente dos modos
Migration aditiva; `EmailSuppression` gravada/lida por Monitor e Product Updates (tabela vazia); correção do handler de descadastro de Product Updates; roteamento do webhook para `EMAIL_DISPATCH`/tópico `relationship`. Nenhum envio novo.

### 10.5 Revisão do diff (62 arquivos → escopo)
- **Núcleo novo (31 novos):** `email-dispatch/*` (+ specs), `email/email-suppression*`, `email/ses-subscription*`, `plans/plans-purchase-confirmation.spec.ts`, `plans/purchase-confirmation-recovery.service.ts`, `scripts/send-relationship-test.ts`, `scripts/recover-purchase-confirmations.ts`, migration, spec e runbook.
- **Fiação mínima (modificados):** `schema.prisma`, `database.service.ts` (4 getters), `config/env.module.ts` (vars novas), `app.module.ts`, `auth.module.ts`/`auth.service.ts` (ganchos pós-verificação + aviso de boot), `plans.module.ts`/`plans.service.ts` (gancho único + `resolveAnalysisCreditsForPlan` exportada + aviso de boot), `monitor.module.ts`, `monitor-public.controller.ts`, `ses-webhook-dispatch.ts`, `email.module.ts`, `email.types.ts`, `email-config.service.ts`, `ses-event.util.ts`.
- **Alterações em fluxos existentes (intencionais, descritas em §9):** `monitor-digest-email.service.ts` (checa supressão), `product-update-*` (supressão + correção do descadastro), specs correspondentes.
- **Suporte:** `.env.example`, `AGENTS.md` (1 linha), `apps/api/package.json` (2 scripts), `apps/api/.railway-redeploy` (convenção; refazer antes do commit).
- Nada fora do escopo: dois arquivos reformatados por engano pelo `biome` foram revertidos.

## 11. Quarta rodada: aba única "Emails" no admin, configurações e conteúdo no banco

### 11.1 Navegação
Uma única aba **Emails** no topo substitui "Alerta de Vagas", "Product Updates" e "Recuperação". Dentro dela uma sub-navegação: **Visão geral · Alerta de Vagas · Product Updates · Recuperação de pagamento · Relacionamento · Compras · Templates · Supressões · Configurações**. As 3 telas antigas **mantêm suas rotas** (`/admin/alerta-vagas`, `/admin/product-updates`, `/admin/payment-recovery`): ganham a sub-navegação por um `layout.tsx` por rota, sem tocar nas páginas (links e testes existentes intactos). As novas ficam em `/admin/emails/*`.

### 11.2 Configurações no banco (padrão Alerta de Vagas / Product Updates)
- `EmailDispatchSettings` (singleton `default`): `welcomeMode`, `feedbackMode`, `feedbackSecondCallMode`, `purchaseConfirmationMode` (`OFF|SHADOW|ALLOWLIST|LIVE`), `startAt` (cutoff), `allowlist`, `extraBlocklist`, `updatedByAdminId`. **Sem linha = tudo OFF e sem cutoff.**
- **Falha fechada:** erro ao ler as configurações → tudo OFF (nunca "último valor conhecido") + log `email_dispatch_settings_unreadable`. Cache de 10s (invalida na hora na instância que gravou).
- **Regras no backend** (`EmailDispatchSettingsService.validate`): qualquer modo ligado exige cutoff; `ALLOWLIST` exige allowlist não vazia; **`LIVE` exige confirmação explícita** quando um tipo passa a `LIVE`; e-mails válidos, normalizados, sem duplicados (máx. 200).
- **Auditoria:** cada alteração grava `MonitorAdminActionLog` (`email_dispatch_settings_updated`, modos antes/depois, **contagens** — nunca os endereços) + log `email_dispatch_settings_updated`.
- Continuam em env, de propósito: remetente/Reply-To/Configuration Set/tópico do SES e credenciais (infra, não decisão de produto). `APP_ENV=production` continua sendo o que libera transporte real, e fora de produção `LIVE` continua rebaixado a `ALLOWLIST` com transporte fake.
- Variáveis removidas: `EMAIL_WELCOME_MODE`, `EMAIL_FEEDBACK_MODE`, `EMAIL_PURCHASE_CONFIRMATION_MODE`, `EMAIL_RELATIONSHIP_START_AT`, `EMAIL_RELATIONSHIP_ALLOWLIST`, `EMAIL_RELATIONSHIP_BLOCKLIST` (se definidas no ambiente, são ignoradas). `EmailDispatchConfigService.getEffectiveMode/getStartAt/isBlocked/isAllowlisted` passaram a ser assíncronos.

### 11.3 Conteúdo editável (assunto + corpo)
- `EmailDispatchTemplate` (uma linha por chave, ausência = texto padrão do código): `WELCOME`, `FEEDBACK_FIRST_USE`, `FEEDBACK_SECOND_CALL`, `PURCHASE_PAID`, `PURCHASE_COUPON`. Corpo em texto com variáveis (`{{saudacao}}`, `{{nome}}`, `{{link}}`, `{{resumo}}`, `{{plano}}`, `{{valor}}`, `{{creditos}}` conforme o tipo); parágrafos separados por linha em branco. O texto padrão renderiza **idêntico** ao anterior (testes de templates inalterados passam).
- **Não editáveis, de propósito:** o rodapé de descadastro dos e-mails de relacionamento (sempre acrescentado pelo sistema, com `{{amazonSESUnsubscribeUrl}}`) e o bloco `{{resumo}}` da compra (montado do snapshot da compra aprovada, nunca de texto digitado).
- **Regras aplicadas no salvar E no preview** (`validateTemplate`): assunto 1–150 caracteres, sem quebra de linha nem variáveis; corpo ≤ 5.000; variável desconhecida recusada (typos não vão para o e-mail); `{{amazonSESUnsubscribeUrl}}` proibido; **feedback (os dois): exatamente uma pergunta, assunto sem `?`, sem links**; boas-vindas: no máximo um link; compra paga: precisa de `{{resumo}}` (ou plano+valor+créditos); **cupom: sem valor/`R$`/"valor pago"/"recebemos o pagamento"/"pagamento confirmado" e assunto sem "compra"**.
- Edição vale para os próximos envios (inclusive os já agendados). Erro de leitura dos templates → usa o texto padrão (nunca bloqueia um envio) + log `email_dispatch_templates_unreadable`. Salvar/restaurar são auditados (`email_dispatch_template_updated|reset`).
- Preview (dados de exemplo) e **"enviar teste"** a UM endereço, com o texto **salvo**; o transporte é real só em produção (a tela diz quando é fake).

### 11.4 API admin (`/api/admin/emails`, admin/superadmin)
`GET overview` (modos efetivos, transporte, prontidão — só motivos, nunca nomes de recursos —, contagens 30d/7d, supressões, compras sem recibo) · `GET/POST settings` · `GET templates` · `POST templates/:key[/preview|/send-test|/reset]` · `GET dispatches[?group|kind|status|includeTest]` · `GET dispatches/:id` (com eventos) · `GET suppressions` · `GET purchase-confirmations/missing` · `POST purchase-confirmations/recover`. Alerta de Vagas e Product Updates seguem nos seus módulos.

### 11.5 Telas novas
Visão geral (ativação por tipo, cutoff, prontidão, saúde, contagens) · Relacionamento e Compras (listas filtráveis; Compras tem o bloco "compras sem recibo" com botão de recuperar) · detalhe de um envio com timeline de entrega · Templates (editor com variáveis, preview em iframe sandbox, restaurar, testar) · Supressões · Configurações (formulário que **não** apaga o digitado quando o backend recusa: usa `onSubmit`, porque no React 19 `<form action>` reseta os campos).

### 11.6 Evidências
API (Postgres real): `admin-emails.service.spec.ts` (10), `email-dispatch-settings.service.spec.ts`, `email-dispatch-template.service.spec.ts`, DI do `AdminEmailsModule`. Web: nav (resolução de rotas, topbar com uma única aba "Emails", layouts), helpers de formulário (cutoff em horário de Brasília, validação de formato), actions, 7 páginas, formulário de configurações e editor de templates (**achados pelos testes:** `Date` aceita lixo como "ontem"; `<form action>` apagava o formulário). Falhas já existentes e alheias: `admin/ingestion/actions.test.ts` e `admin/payment-recovery/page.test.tsx`.

## 12. Estado atual e próximos passos (checkpoint)
Resumo do que foi feito e do que falta está em **`docs/handoff-email-dispatch-2026-10-01.md`** (commits, o que existe, variáveis do Railway, lista ordenada do que falta, riscos conhecidos e como retomar). Em uma linha: tudo implementado e testado em `develop` local (não enviada ao remoto); falta IAM, a variável `AWS_SES_RELATIONSHIP_TOPIC_NAME`, publicar, o teste real `--real-send --no-db` com as verificações V1–V5 e só então a ativação gradual pelo admin.
