# CLAUDE.md — EarlyCV

## Leitura obrigatoria antes de qualquer tarefa

Leia nesta ordem:

1. `AGENTS.md`
2. `ARCHITECTURE.md`
3. `CODE_GUIDELINES.md`
4. `specs/backend-core-slice-1-handoff.md`
5. `docs/superpowers/specs/2026-04-04-cv-adaptation-design.md`
6. `docs/superpowers/plans/2026-04-04-cv-adaptation-implementation.md`

---

## Invariantes do produto (nunca violar)

- Nunca inventar fatos de carreira (experiencias, cargos, resultados, certificacoes, tecnologias).
- `firstSeenAt` e imutavel apos primeira aceitacao de um Job.
- `canonicalKey` deve ser deterministicamente derivado da identidade remota da vaga.
- `apps/web` fala apenas com `apps/api`. Regras de negocio ficam na API.
- Antes de encerrar qualquer entrega: rodar `check`, `build` e `test` no escopo impactado.

---

## Contexto de negocio

EarlyCV e um SaaS copilot para candidaturas no Brasil, foco inicial em tecnologia, dados,
produto, analytics/BI e funcoes digitais adjacentes.

O maior valor entregue ao usuario e a **adaptacao inteligente do curriculo para uma vaga
especifica**, aumentando as chances de ser chamado para entrevista.

---

## Prioridade atual — MVP de adaptacao de CV

O scraping/ingestao e o painel admin existem no projeto mas estao pausados.
O foco imediato e construir o fluxo core de adaptacao de CV.

### Fluxo do usuario

1. Upload do CV em PDF
2. Cola a descricao da vaga (texto livre)
3. IA analisa os dois e retorna o CV adaptado
4. Pagamento antes de liberar o resultado completo

### O que construir agora

**Backend (NestJS)**

- Modulo `cv-adaptation` (module / controller / service / dto)
- Endpoint `POST /cv-adaptation/analyze` — recebe PDF + texto da vaga
- Integracao com IA (`packages/ai`) para analise e reescrita do CV
- Endpoint de checkout (Mercado Pago ou Stripe)

**Frontend (Next.js)**

- Pagina de upload: campo de PDF + textarea da vaga
- Pagina de resultado: CV adaptado com gate de pagamento
- Pagina de checkout/confirmacao

**Schema (Prisma)**

- Entidade `CvAdaptation` vinculada ao usuario
- Campos: `cvFileUrl`, `jobDescription`, `adaptedContent`, `status`, `paidAt`

### Regras especificas deste slice

- Nunca preencher campos do CV com informacoes que nao vieram do PDF original do usuario.
- A adaptacao deve reorganizar, destacar e reformular — nunca inventar.
- Seguir os padroes de modulo Nest definidos em `CODE_GUIDELINES.md` secao 5.
- Schema em `packages/database`, client gerado apos cada mudanca.
- Rotas do Next.js seguem App Router; paginas publicas com SEO completo.

---

## Roadmap — proximas ondas (nao implementar agora)

### Segunda onda — vagas e matching

- Ingestao confiavel de vagas (Gupy, Greenhouse) — slice ja em andamento em paralelo
- Matching entre perfil do usuario e vagas captadas
- Alerta de vagas novas antes da divulgacao publica (diferencial de timing)
- Ranking de vagas por compatibilidade com o CV do usuario

### Terceira onda — inteligencia e retencao

- Historico de candidaturas e acompanhamento
- Score de compatibilidade CV x vaga com sugestoes de melhoria de perfil
- Painel do usuario com metricas de candidatura

Decisoes de arquitetura do MVP devem ser reversiveis e nao bloquear essas ondas.

---

## Verificacao antes de encerrar qualquer entrega

```bash
npm run check
npm run generate --workspace @earlycv/database
npm run build
npm run test
```

---

## Memoria operacional (dashboard + CV Master)

- O dashboard principal e `/dashboard` (a rota `dashboard-teste` foi descontinuada).
- A hierarquia esperada do dashboard e: CTA principal -> card CV Master -> metricas -> historico.
- Deve existir apenas um CTA principal de analise (`Analisar nova vaga`) sem duplicatas no historico.
- O card de CV Master usa `/cv-base` para `Cadastrar CV`, `Atualizar CV` e `Ver CV` (download do rawText como .txt).
- Em `/adaptar`, quando houver CV Master, o usuario escolhe entre `Usar meu CV base` e `Enviar outro CV`; sem master, fluxo de upload permanece obrigatorio.
- O historico em `/dashboard` deve usar paginacao por querystring (`page`, `limit`) com opcoes 10/20/50.
- Acoes de download (PDF/DOCX) usam overlay bloqueante com feedback de etapa (`montando` -> `concluindo`) ate disparar o arquivo.
- O header da aplicacao e globalmente fixo no topo com 5% de transparencia e sem borda inferior.

## Memoria operacional (processo de trabalho)

- A partir de agora, trabalhar diretamente na branch local `main` por padrao.
- Nao criar/usar worktrees ou fluxos paralelos sem pedido explicito do usuario.
- Antes de qualquer merge/sync sensivel, criar snapshot local e validar `git status` para evitar perda de trabalho.
- Estado de referencia atual: `main` local/remoto sincronizados e suite de testes verde apos ajustes de estabilidade em e2e da API.
- Estado mais recente: freemium consolidado com claim por credito sem redirect forcado, popup de liberacao com fade, padronizacao de CTAs e correcoes de PT-BR nas telas principais.
- Memoria mais nova: paginas publicas de `Privacidade` e `Termos de Uso` criadas com metadata completa + links discretos no rodape da landing; painel de planos atualizado com plano free e contadores de analise; bug de travamento no back/forward com spinner de transicao permanece pendente e em investigacao.
- Memoria mais nova: slice `analysis-protection + analysis-observability` implementado (facade protegida, turnstile, rate-limit/dedupe/usage policy, telemetry e funnel idempotente) e integrado no `cv-adaptation` sem mudar UX visivel.
- Referencia operacional oficial do slice: `docs/analysis-protection-operational-runbook.md`.
- Convencao nova: documentos operacionais de uso diario devem ser criados em `docs/runbook/`.
- Convencao Railway/migrations: toda nova migration deve ser acompanhada de `npm run railway:touch-api` (grava timestamp em `apps/api/.railway-redeploy`). Commitar os dois juntos para que Railway detecte mudanca em `apps/api/**` e dispare redeploy, que executa `prisma migrate deploy` antes de subir o servidor.
