# EarlyCV Analytics v2 - Plano de saneamento e evolucao

## Status desta spec

Documento de planejamento tecnico. Nao implementar nada a partir desta spec sem aprovacao posterior.

Restricoes desta etapa:

- Nao alterar codigo
- Nao alterar PostHog
- Nao alterar GA4
- Nao alterar dashboards
- Nao criar/remover eventos nesta etapa
- Nao fazer commits

---

## 1. Arquitetura analitica alvo

A arquitetura-alvo deve separar papeis sem forcar convergencia artificial entre sistemas que hoje resolvem problemas diferentes.

### 1.1 GA4

GA4 deve ser a fonte principal de aquisicao e web analytics:

- usuarios web
- novos usuarios
- sessoes
- landing pages
- source / medium / channel
- SEO

### 1.2 PostHog `$pageview`

`$pageview` deve ser mantido para tudo que depende da semantica nativa do PostHog:

- web analytics nativo do PostHog
- pageview-based features
- session replay / pathing / page-based insights quando aplicavel

### 1.3 `page_view` customizado

`page_view` deve ser mantido como evento interno de jornada EarlyCV:

- transicoes de rota
- `previous_route`
- `routeVisitId`
- `sessionInternalId`
- persistencia em `BusinessFunnelEvent`
- Sankey / projecoes / funis internos

### 1.4 Eventos de produto

Eventos de produto continuam como camada comportamental:

- analise
- unlock / download
- checkout / pagamento
- candidaturas
- Radar
- interview prep
- cover letter

### 1.5 Eventos backend

Eventos backend continuam como fonte definitiva para eventos transacionais:

- principalmente `payment_approved`
- e futuros `analysis_completed` / `analysis_failed` se aprovados

### 1.6 Principio central

Nao tentar fazer um unico evento servir aquisicao, jornada interna e semantica transacional ao mesmo tempo.

---

## 2. Contrato Visitor / Session / User

## 2.1 Visitor

Contrato proposto:

- identidade oficial: `visitor_id`
- tipo: string aleatoria estavel por browser
- origem: frontend
- momento de criacao: primeira visita elegivel ao produto
- persistencia: storage/cookie first-party proprio
- duracao: longa, renovavel, independente de sessao

Antes do consentimento:

- se consentimento bloquear persistencia, usar identificador transitorio em memoria
- nao promover isso a identidade analitica estavel de longo prazo

Apos consentimento:

- persistir `visitor_id`
- usar como identidade anonima canonica em eventos EarlyCV

Apos signup/login:

- `visitor_id` nao some
- continua como ponte da jornada pre-auth ate associacao com `user_id`

Objetivo: parar de usar sessao como substituto implicito de visitante.

## 2.2 Session

Contrato proposto:

### `$session_id`

- funcao oficial: sessao nativa do PostHog
- origem: `posthog-js`
- uso: correlacao com recursos nativos do PostHog e coesao com o browser session model

### `sessionInternalId`

- funcao oficial: sessao logica EarlyCV para pipeline interno
- origem: frontend/app
- uso: persistencia interna, regras de jornada, idempotencia e projecoes proprias

Regra proposta:

- nao eliminar nenhum agora
- cada evento EarlyCV relevante pode carregar os dois
- dashboards e docs precisam parar de trata-los como equivalentes

## 2.3 User

Contrato proposto:

- campo canonico nos eventos EarlyCV: `user_id`
- origem: ID estavel da conta autenticada EarlyCV
- `userId` deve ser tratado como legado transitorio
- `identified_user_id` e `$user_id` devem ser considerados derivados/compatibilidade, nao canon

Regra proposta:

- eventos novos usam `user_id`
- eventos existentes podem continuar carregando `userId` por compatibilidade durante migracao
- backend resolve `distinct_id` preferindo uma identidade de visitante estavel no anonimo e `user_id` no autenticado

---

## 3. Fluxo anonymous -> authenticated

Fluxo ideal:

`visitor anonimo -> sessao -> analise guest -> signup/login -> usuario autenticado`

Diretrizes:

- preservar a jornada anterior ao cadastro
- nao perder correlacao entre comportamento guest e conta criada
- manter compatibilidade com `posthog.identify()`
- tratar ausencia atual de `alias()` como escolha consciente ate definicao de identidade futura

### 3.1 Estrategia recomendada

- manter `posthog.identify(user_id)` no ponto de autenticacao resolvida
- nao introduzir `alias()` sem definir antes o contrato exato de `visitor_id`
- propagar `visitor_id`, `$session_id` e `sessionInternalId` junto com `user_id` durante a transicao
- registrar eventos de conversao autentica com contexto de guest conversion quando aplicavel

### 3.2 Riscos a controlar

- perda de historico guest se a identidade anonima continuar baseada em sessao
- fragmentacao de identidade se `visitor_id` for introduzido sem fase de coexistencia
- inconsistencias quando consentimento impedir persistencia local
- leituras erradas se `auth_session_identified` continuar sendo usado como proxy de signup

---

## 4. Taxonomia proposta

Camadas oficiais:

### 4.1 Web analytics

- sistema: GA4
- foco: aquisicao, landing, canais, sessoes

### 4.2 Page analytics nativo

- sistema: PostHog
- evento principal: `$pageview`

### 4.3 Journey analytics

- `page_view`
- `page_leave`
- `session_started`
- `session_engaged`

### 4.4 Auth

- `auth_session_identified`
- futuro `signup_completed`

### 4.5 Analysis funnel

- `analyze_submit_clicked`
- `analysis_started`
- futuro `analysis_completed`
- futuro `analysis_failed`
- futuro `analysis_result_viewed`

### 4.6 Checkout / payment

- `buy_credits_clicked`
- `checkout_started`
- `checkout_abandoned`
- `payment_return_viewed`
- `payment_approved`

### 4.7 CV value realization

- `cv_unlock_started`
- `cv_unlock_completed`
- `optimized_cv_downloaded`

### 4.8 Applications

- `candidatura_created`
- `candidatura_marked_as_applied`
- demais eventos do modulo

### 4.9 Radar

- `radar_view`
- poucos eventos adicionais de alta utilidade

### 4.10 Artifacts

- `interview_prep_*`
- `cover_letter_*`

### 4.11 Regra de nomenclatura futura

- verbo no participio/passado para fato consumado
- `*_clicked` apenas para intencao explicita de UI
- nao usar o mesmo nome para intencao e sucesso

---

## 5. Correcoes necessarias

## 5.1 Ownership mismatch

### `analysis_started`

- dono recomendado: `backend`, se a semantica oficial for "requisicao de analise aceita/iniciada de fato"
- alternativa: manter frontend apenas se o significado for "inicio da tentativa do usuario"
- recomendacao semantica: reservar `analysis_started` para inicio real aceito pela API
- o clique continua sendo `analyze_submit_clicked`

### `cv_upload_completed`

- dono recomendado: `frontend` se representa upload concluido no browser
- dono recomendado: `backend` se representa arquivo validado e aceito pela API
- melhor definicao: usar backend se o objetivo e medir etapa confiavel do funil
- se houver necessidade de medir UX de upload, isso deveria virar outro evento de UI no futuro, nao sobrecarregar o mesmo nome

## 5.2 Eventos checkout fora do registry

### `checkout_brick_ready`

- deve entrar no registry somente se houver uso analitico real
- owner: `frontend`
- semantica: componente de pagamento carregado e pronto para interacao
- propriedades minimas:
  - `purchaseId`
  - `plan`
  - `amount`
  - `provider`
  - `route`
  - `user_id?`
  - `$session_id`
  - `sessionInternalId`

### `checkout_brick_submit_started`

- owner: `frontend`
- semantica: usuario submeteu o brick
- propriedades minimas: mesmas do acima + `payment_method?`

### `checkout_brick_submit_failed`

- owner: `frontend`
- semantica: falha de submissao no client/SDK antes de aprovacao transacional
- propriedades minimas:
  - `failure_stage`
  - `error_code`
  - `retryable`
  - correlacao de checkout

## 5.3 Eventos mortos

Classificacao proposta:

- `site_exit_candidate`
  - deprecar
  - existe mas nao entrega semantica confiavel
- `site_exit`
  - deprecar se nao houver emissor real e uso analitico ativo
- eventos em docs sem emissor
  - marcar como `stale catalog`
  - nao remover do historico
  - retirar da documentacao viva quando a implementacao vier

---

## 6. Novos eventos fundamentais

## 6.1 `signup_completed`

Semantica oficial:

- nova conta criada com sucesso
- nao representa login
- nao representa restauracao de sessao

Contrato proposto:

- owner recomendado: `backend`
- momento: persistencia bem-sucedida da nova conta, antes de qualquer redirect pos-signup
- idempotencia: por `user_id` + origem de cadastro

Propriedades:

- `user_id`
- `signup_method`
- `is_guest_conversion`
- `visitor_id?`
- `$session_id?`
- `sessionInternalId?`
- UTMs disponiveis
- `route`
- `conversion_context` como `analysis_guest`, `checkout`, `direct_auth`

## 6.2 `analysis_completed`

Semantica:

- analise de CV concluida com sucesso do ponto de vista de produto

Contrato proposto:

- owner recomendado: `backend`
- momento: quando a analise produz resultado utilizavel e estado final esperado

Correlacao:

- `analysis_id` / `adaptation_id`
- `request_id`
- `correlation_id`

Propriedades:

- `user_id?`
- `visitor_id?`
- `mode` = `guest` | `authenticated`
- `origin` = `/adaptar`, dashboard etc.
- `processing_time_ms`
- `cv_source` = `master_cv` | `upload`
- `$session_id?`
- `sessionInternalId?`

## 6.3 `analysis_failed`

Semantica:

- fluxo de analise falhou de forma observavel para produto

Contrato proposto:

- owner recomendado: `backend`
- momento: falha terminal da analise

Propriedades:

- `analysis_id`
- `stage`
- `error_code`
- `retryable`
- `mode`
- `origin`
- `processing_time_ms?`
- sem payload sensivel

Usar taxonomia controlada de erro.

## 6.4 `analysis_result_viewed`

Semantica:

- resultado efetivamente visto/renderizado pelo usuario

Contrato proposto:

- owner recomendado: `frontend`
- momento: renderizacao completa e visivel do estado com resultado
- nao disparar em simples chegada de rota

Propriedades:

- `analysis_id`
- `mode`
- `is_locked`
- `user_id?`
- `visitor_id?`
- `$session_id`
- `sessionInternalId`
- `routeVisitId`

---

## 7. Revisao semantica dos eventos existentes

### `analyze_submit_clicked`

- status: correto
- semantica: intencao do usuario
- nao deve ser interpretado como inicio real da analise

### `analysis_started`

- status: ambiguo hoje
- conflito entre nome e owner atual
- precisa definicao oficial antes de implementacao

### `payment_return_viewed`

- status: correto, mas frequentemente mal interpretado
- representa retorno/visualizacao da pagina pos-provedor
- nao representa aprovacao

### `payment_approved`

- status: correto
- este deve continuar sendo a referencia de pagamento aprovado
- backend-only

### `cv_unlock_started`

- status: correto, mas precisa doc explicita por fluxo
- pode ficar muito proximo de `cv_unlock_completed`

### `cv_unlock_completed`

- status: correto
- evento de conclusao real
- volumes parecidos com `started` nao sao necessariamente erro

### `optimized_cv_downloaded`

- status: ambiguo
- hoje tende a representar clique/inicio de tentativa de download, nao download confirmado
- nao renomear historico
- documentar a semantica real
- se necessario no futuro, adicionar um evento distinto para "download entregue"

### `auth_session_identified`

- status: ambiguo
- nome sugere identificacao de sessao, mas seu uso atual mistura restauracao/auth transition
- nao serve como proxy confiavel de signup
- nao serve como proxy confiavel de login novo

Regra geral: preservar historico; melhorar semantica por documentacao, versionamento e novos eventos, nao por retrofit destrutivo.

---

## 8. Radar

O Radar deve ganhar apenas eventos de alta utilidade, evitando overtracking.

Jornada desejada:

- `radar_view`
- oportunidade exibida
- oportunidade clicada
- detalhe da vaga
- salvar
- iniciar candidatura
- candidatura criada
- marcada como aplicada

Proposta pragmatica:

- manter `radar_view`
- considerar `radar_opportunity_clicked`
- considerar `job_detail_viewed` apenas se nao houver equivalente solido
- considerar `radar_apply_started` ou reutilizar `candidatura_created` com contexto
- medir `save` apenas se a feature for real e gerar decisao acionavel

---

## 9. GA4

Plano proposto para GA4, sem alterar nada agora:

- excluir `/admin` e `/superadmin`
- excluir trafego interno quando houver criterio confiavel:
  - IP interno
  - parametro tecnico
  - dominio interno
  - user property controlada
- consolidar domains:
  - `earlycv.com.br`
  - `www.earlycv.com.br`
- confirmar timezone da propriedade para `America/Sao_Paulo`
- padronizar UTMs aceitas:
  - `utm_source`
  - `utm_medium`
  - `utm_campaign`
  - `utm_content`
  - `utm_term`
- definir oficialmente:
  - first-touch para aquisicao historica
  - session-touch para sessao atual
  - conversion-touch para evento de conversao

Regra: nao usar `page_view` customizado como fonte de "unique visitors".

---

## 10. UTMs e atribuicao

Estrategia recomendada:

## 10.1 First touch

- origem inicial do visitante
- persiste em storage proprio
- nao sobrescreve em visitas futuras
- atribuida ao `visitor_id`

## 10.2 Session touch

- origem da sessao atual
- recalculada no inicio de cada nova sessao
- vinculada a `$session_id` e `sessionInternalId`

## 10.3 Conversion touch

- snapshot da origem vigente quando ocorre conversao relevante
- nao recalcula retroativamente
- usada para `signup_completed`, `payment_approved`, futuros `analysis_completed`

## 10.4 Backend attribution

- `payment_approved` nao deve inventar UTM se ela nao estiver disponivel de forma confiavel
- backend deve receber um snapshot explicito de attribution do frontend ou recuperar de registro interno persistido por correlacao
- se nao houver snapshot confiavel, melhor `null` do que atribuicao falsa

## 10.5 Explicacao para volume alto de UTM nula

`utm_source = null` e `utm_campaign = null` podem ocorrer por:

- trafego direto
- navegacoes internas
- acessos sem query params
- origem organica sem tagging manual
- eventos backend sem snapshot de atribuicao
- sessoes pos-login ou retorno sem UTM na URL

---

## 11. Dashboard Growth v2

## 11.1 Acquisition

Fonte: GA4

Metricas:

- usuarios
- novos usuarios
- sessoes
- usuarios por canal
- organic search
- landing pages
- source / medium
- conversao por landing

## 11.2 Activation

Funil proposto:

- visita a `/adaptar`
- job description preenchida
- CV disponivel
- `analyze_submit_clicked`
- `analysis_started`
- `analysis_completed`
- `analysis_result_viewed`
- `signup_completed` quando aplicavel

Leituras importantes:

- separar guest e authenticated
- separar com CV base vs upload

## 11.3 Monetization

- `buy_credits_clicked`
- `checkout_started`
- `payment_return_viewed`
- `payment_approved`
- receita
- compradores novos
- recompra
- conversao por plano

## 11.4 Engagement

- analises por usuario
- unlocks
- downloads
- candidaturas criadas
- candidaturas marcadas como aplicadas
- `radar_view`
- uso de interview prep
- uso de cover letter

## 11.5 Retention

Nao usar DAU/WAU como centro.

Metricas mais adequadas ao EarlyCV:

- usuarios que voltam para nova analise em 7/30/60 dias
- recompra em 30/90 dias
- reutilizacao de artifacts apos primeira analise
- recorrencia de candidatura por usuario
- retorno ao Radar apos primeira visita

---

## 12. Estrategia de compatibilidade

| Mudanca | Impacto historico | Compatibilidade | Precisa backfill? | Risco |
|---|---|---|---|---|
| Formalizar `page_view` como jornada interna | Baixo | Total | Nao | Baixo |
| Manter `$pageview` e `page_view` em paralelo com papeis distintos | Nulo | Total | Nao | Baixo |
| Introduzir `visitor_id` futuro | Medio | Alta se coexistir com modelo atual | Nao inicialmente | Medio |
| Tornar `user_id` canonico | Baixo | Alta com fase transitoria | Nao | Baixo |
| Corrigir ownership de `analysis_started` | Medio | Alta se semantica for documentada e versionada | Nao | Medio |
| Corrigir ownership de `cv_upload_completed` | Medio | Alta se sem renomear historico | Nao | Medio |
| Registrar eventos checkout do brick | Nulo | Alta | Nao | Baixo |
| Adicionar `signup_completed` | Positivo | Total | Nao | Baixo |
| Adicionar `analysis_completed` / `failed` / `result_viewed` | Positivo | Total | Nao | Baixo |
| Deprecar eventos mortos apenas em documentacao | Nulo | Total | Nao | Baixo |

Diretriz: evitar backfill salvo se houver necessidade operacional muito forte. O historico legado deve continuar interpretavel via documentacao de semantica, nao por reescrita.

---

## 13. Versionamento

Regras oficiais propostas:

### 13.1 Novo evento

Criar novo evento quando:

- a semantica muda de forma material
- o evento atual esta ambiguo demais
- preservar historico e mais importante do que "embelezar" taxonomia

### 13.2 Nova versao

Criar nova versao quando:

- propriedade obrigatoria muda
- semantica do mesmo nome muda, mas ainda vale manter o nome
- contrato consumido por pipeline interno precisa distinguir formatos

### 13.3 Mudanca de propriedade

- propriedade obrigatoria nova: nova versao
- propriedade opcional nova: pode manter versao se nao quebrar consumidores
- remocao de propriedade usada: nova versao

### 13.4 Evento depreciado

- manter no registry/documentacao com status deprecado
- nao remover historico
- documentar substituto, se existir

### 13.5 Fonte unica de verdade

Consolidar uma documentacao unica como fonte oficial da taxonomia, alinhada ao registry em codigo. As docs antigas divergentes devem ser tratadas como legado e removidas do papel de referencia ativa na fase de cleanup.

---

## 14. Qualidade e testes

Planejamento de testes automaticos:

- evento emitido apenas uma vez
- ownership correto
- evento registrado
- propriedades minimas
- idempotencia
- transicoes anonymous/authenticated
- comportamento production vs development
- exclusao de admin
- pagamentos sem duplicidade

### 14.1 Suites recomendadas

- testes de registry/versionamento
- testes de ownership frontend/backend
- testes de journey para evitar duplicidade em `page_view`
- testes de auth transition
- testes de correlacao de pagamento
- testes de eventos ausentes obrigatorios do funil

### 14.2 Smoke tests analiticos pos-deploy

Validacoes sugeridas:

- `page_view` segue chegando ao pipeline interno
- `$pageview` continua ativo no PostHog
- eventos novos aparecem com properties minimas
- admin continua excluido
- `payment_approved` continua backend-only
- sem aumento inesperado de duplicidade em page/journey events

---

## 15. Plano de implantacao por fase

## Fase A - correcoes semanticas sem quebra

Objetivo:

- documentar contrato oficial
- corrigir registry/ownership/versionamento sem remover historico

Arquivos provaveis:

- `apps/api/src/analysis-observability/*`
- documentacao de analytics

Risco: baixo a medio

Testes:

- evento registrado
- ownership correto
- propriedades minimas

Dependencias: nenhuma

Rollback: reverter metadata/registry

## Fase B - eventos ausentes

Objetivo:

- adicionar `signup_completed`
- adicionar `analysis_completed`
- adicionar `analysis_failed`
- adicionar `analysis_result_viewed`
- opcionalmente formalizar eventos do brick de checkout

Arquivos provaveis:

- backend de auth
- backend de CV/analyze
- frontend de resultado
- registry + testes

Risco: medio

Testes:

- emissao unica
- idempotencia
- payload minimo

Dependencias: Fase A

Rollback: desabilitar emissao mantendo codigo compativel

## Fase C - identidade

Objetivo:

- introduzir contrato `visitor_id`
- consolidar `user_id`
- formalizar transicao anonymous -> authenticated

Arquivos provaveis:

- provider frontend
- helpers de analytics
- pipeline backend
- docs de identidade

Risco: alto

Testes:

- transicao anonymous/auth
- consent gate
- persistencia visitor/session/user

Dependencias: Fase A

Rollback: fallback para resolucao atual de distinct id

## Fase D - Radar

Objetivo:

- instrumentar jornada de Radar com poucos eventos de alto valor

Eventos candidatos:

- `radar_opportunity_clicked`
- `job_detail_viewed` se ainda nao houver equivalente solido
- `radar_apply_started` ou reutilizar `candidatura_created` com contexto
- `opportunity_saved` so se existir feature real

Risco: medio

Testes:

- no overtracking
- ownership e properties

Dependencias: Fase A

Rollback: remover emitters novos sem afetar core funnel

## Fase E - dashboards

Objetivo:

- publicar Growth v2 usando semantica ja estabilizada

Risco: baixo

Testes:

- smoke queries
- consistencia entre GA4 e PostHog

Dependencias: Fase A + Fase B

Rollback: manter dashboards antigos paralelos

## Fase F - cleanup/depreciacao

Objetivo:

- marcar eventos mortos
- remover dependencias documentais divergentes
- consolidar docs

Risco: baixo

Testes:

- nenhum evento ativo perde suporte sem aprovacao

Dependencias: Fases A-E

Rollback: reclassificar docs deprecadas

---

## 16. Riscos

- introduzir `visitor_id` sem estrategia de coexistencia pode fragmentar historicos
- confundir `analysis_started` como clique ou como aceitacao real continua poluindo funnel
- tentar atribuir UTMs no backend sem snapshot confiavel cria falso marketing attribution
- usar `optimized_cv_downloaded` como proxy de sucesso de download pode superestimar consumo real
- tratar `auth_session_identified` como signup ou login gera leituras erradas de auth funnel
- migrar sem documentacao unica repetira a divergencia atual entre codigo e docs

---

## 17. Questoes que ainda exigem decisao de produto

- `analysis_started` deve significar clique validado ou processamento realmente aceito?
- `cv_upload_completed` interessa como metrica de UX client-side ou apenas como aceitacao backend?
- queremos medir "save" no Radar so quando a funcionalidade tiver uso real, ou isso e prematuro?
- `signup_completed` deve marcar apenas cadastro novo ou tambem claim/guest conversion como subtipo do mesmo evento?
- no dashboard Growth v2, a ativacao principal do produto termina em `analysis_result_viewed` ou em `payment_approved` para o modelo atual?
- para attribution de receita, a fonte oficial sera GA4 com reconciliacao por backend ou PostHog com snapshot interno?

---

## 18. Resultado esperado desta spec

Esta spec deve servir como base de aprovacao para a proxima etapa, em que a implementacao podera ser detalhada e executada em fases pequenas, sem quebrar:

- o pipeline interno baseado em `page_view`
- os recursos nativos do PostHog baseados em `$pageview`
- a leitura de aquisicao concentrada em GA4
- o historico acumulado dos eventos existentes
