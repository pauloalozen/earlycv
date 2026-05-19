<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# EarlyCV — Guia de Agentes

## Leitura obrigatoria antes de qualquer tarefa

Leia nesta ordem:

1. Este arquivo (`AGENTS.md`)
2. `ARCHITECTURE.md`
3. `CODE_GUIDELINES.md`
4. `specs/backend-core-slice-1-handoff.md`
5. `docs/superpowers/specs/2026-04-04-cv-adaptation-design.md`
6. `docs/superpowers/plans/2026-04-04-cv-adaptation-implementation.md`

---

## Contexto do produto

EarlyCV e um SaaS copilot para candidaturas no Brasil, foco inicial em tecnologia, dados, produto, analytics/BI e funcoes digitais adjacentes.

O maior valor entregue ao usuario e a **adaptacao inteligente do curriculo para uma vaga especifica**, aumentando as chances de ser chamado para entrevista.

Direcao futura: descobrir vagas cedo em portais de carreira, explicar a aderencia entre curriculo e vaga e adaptar curriculos sem inventar fatos. `first_seen_at` e sinal central de produto e deve permanecer visivel em modelagem, ranking, alertas e UX quando relevante.

---

## Invariantes do produto (nunca violar)

- Nunca inventar experiencias, cargos, resultados, certificacoes, tecnologias ou responsabilidades. Toda adaptacao precisa preservar rastreabilidade para fatos reais do curriculo/perfil.
- `firstSeenAt` e imutavel apos primeira aceitacao de um Job.
- `canonicalKey` deve ser deterministicamente derivado da identidade remota da vaga.
- `apps/web` fala apenas com `apps/api`. Regras de negocio ficam na API.
- Antes de encerrar qualquer entrega: rodar `check`, `build` e `test` no escopo impactado.

---

## Monorepo e stack

- Direcao de monorepo: `apps/web`, `apps/api`, `packages/config`, `packages/database`, `packages/queue`, `packages/storage`, `packages/ai`.
- `apps/web` fala apenas com `apps/api`; `apps/api` concentra regras de negocio e orquestracao de infraestrutura.
- Stack principal: Next.js App Router, TypeScript, Tailwind CSS v4, Biome.

---

## Visual e componentes

- Diretriz visual antiga (laranja/terracota) esta descontinuada e nao deve mais ser utilizada.
- Nova diretriz ativa: linguagem monocromatica escura-sobre-clara nas paginas de usuario, conforme `CODE_GUIDELINES.md` (secao 7); manter laranja fora do produto por enquanto.
- Componentes genericos reutilizaveis ficam no pacote de UI compartilhada do monorepo; enquanto essa extracao nao acontece, use `apps/web/src/components/ui` no app web e siga tambem `apps/web/src/components/ui/AGENTS.md`.

---

## SEO

- SEO e requisito de produto: toda rota publica deve sair com metadata completa, canonical, OG/Twitter, robots e structured data quando fizer sentido.
- Vagas publicas devem ter URL dedicada, conteudo renderizado no servidor e `JobPosting` estruturado.
- Rotas internas, utilitarias ou de showcase normalmente devem usar `noindex`.

---

## Estado atual do backend

- `packages/database` ja tem schema Prisma real + migration inicial + seed.
- `apps/api` ja integra auth, profiles, resumes, companies, job-sources e jobs em `AppModule`.
- Surface atual obrigatorio de env da API: `DATABASE_URL`, `API_HOST`, `API_PORT`, `JWT_*`, `GOOGLE_*` e `LINKEDIN_*`; confira `.env.example` antes de rodar `apps/api`.
- Slice de protecao e observabilidade da analise de CV foi implementado em `apps/api/src/analysis-protection` e `apps/api/src/analysis-observability`, com boundary obrigatorio no `cv-adaptation`.
- O fluxo `/cv-adaptation/analyze-guest` agora exige token turnstile encaminhado pelo web app, com cobertura dedicada em testes de API e web submit-flow.
- Runbook operacional oficial da protecao/observabilidade: `docs/analysis-protection-operational-runbook.md` (checklists diarios/semanais, rollback e incident playbooks).

---

## Versao atual e roadmap

### v1.2 — Producao hoje (branch `main`)

Fluxo core de adaptacao de CV:

1. Upload do CV em PDF
2. Cola a descricao da vaga (texto livre)
3. IA analisa os dois e retorna o CV adaptado
4. Pagamento antes de liberar o resultado completo

Regras especificas:
- Nunca preencher campos do CV com informacoes que nao vieram do PDF original do usuario.
- A adaptacao deve reorganizar, destacar e reformular — nunca inventar.
- Seguir os padroes de modulo Nest definidos em `CODE_GUIDELINES.md` secao 5.
- Schema em `packages/database`, client gerado apos cada mudanca.
- Rotas do Next.js seguem App Router; paginas publicas com SEO completo.

### v2.1 — Proxima versao (branch `develop`)

Modulo de ingestao de vagas sobre `Company`, `JobSource` e `Job`, preservando `canonicalKey` e `firstSeenAt` como invariantes do produto.

- Adaptadores reais Gupy e Greenhouse (hoje existem apenas mocks)
- Engine de regras de captura (include/exclude por keyword/departamento)
- Metricas operacionais ricas no run (discovered/accepted/filtered + summary)
- UI admin para editar/exibir capture policy
- Pagina publica de vagas (hoje em mock por decisao de produto)

Especificacoes: `docs/superpowers/specs/2026-04-02-job-ingestion-crawler-design.md`
Plano de implementacao: `docs/superpowers/plans/2026-04-02-job-ingestion-crawler-implementation.md`

### Terceira onda (nao implementar agora)

- Matching entre perfil do usuario e vagas captadas
- Alerta de vagas novas antes da divulgacao publica (diferencial de timing)
- Ranking de vagas por compatibilidade com o CV do usuario
- Historico de candidaturas e acompanhamento
- Score de compatibilidade CV x vaga com sugestoes de melhoria de perfil
- Painel do usuario com metricas de candidatura

Decisoes de arquitetura do v1.2 devem ser reversiveis e nao bloquear essas ondas.

---

## Git workflow

### Branches principais

| Branch | Proposito | Versao |
|--------|-----------|--------|
| `main` | Producao — sempre estavel, sempre deployavel | `1.2.x` |
| `develop` | Desenvolvimento da proxima versao | `2.1.0-beta` |

**Nunca commitar diretamente em `main`.** Todo merge em main exige PR.

### Tipos de branch

**Feature (trabalho novo)**
- Base: `develop`
- Merge: `develop`
- Padrao de nome: `feature/descricao-curta`
- Exemplos: `feature/job-ingestion-gupy`, `feature/capture-rules`, `feature/jobs-public-page`

**Hotfix (correcao urgente de producao)**
- Base: `main`
- Merge: `main` **e** `develop` (obrigatorio nos dois)
- Padrao de nome: `hotfix/descricao-curta`
- Exemplos: `hotfix/pagamento-pix`, `hotfix/upload-cv-timeout`

### Fluxo de trabalho

Trabalho normal na v2.1:
```
git checkout develop && git pull
git checkout -b feature/nome-da-feature
# desenvolve
git checkout develop
git merge feature/nome-da-feature
```

Correcao urgente em producao:
```
git checkout main
git checkout -b hotfix/nome-do-bug
# corrige
git checkout main && git merge hotfix/nome-do-bug   # deploy de producao
git checkout develop && git merge hotfix/nome-do-bug  # mantem develop sincronizado
```

Mergear o hotfix em `develop` imediatamente apos o deploy em `main` e obrigatorio. Hotfixes acumulados sem merge em `develop` geram conflitos na hora do lancamento da v2.1.

### Versionamento

- Cada hotfix deployado em `main` incrementa o patch: `1.2.0` → `1.2.1` → `1.2.2`
- `develop` permanece em `2.1.0-beta` durante todo o desenvolvimento
- Quando a v2.1 estiver pronta: `develop` mergeia em `main`, tag `2.1.0`, novo ciclo comeca

### Instrucoes para agentes

- **Toda tarefa de v2.1 comeca em `develop`**, nunca em `main`
- Antes de iniciar qualquer tarefa, confirmar em qual branch esta: `git branch --show-current`
- Ao criar uma feature branch, sempre partir de `develop` atualizado: `git checkout develop && git pull`
- Nunca mergear feature diretamente em `main`
- Em caso de hotfix, mergear em `main` e `develop` antes de fechar a tarefa
- Nomear branches seguindo o padrao acima — sem espacos, sem caracteres especiais, separado por hifen
- Nao criar worktrees ou fluxos paralelos sem pedido explicito do usuario

---

## Convencoes operacionais

- **Railway/migrations:** toda nova migration Prisma deve ser acompanhada de `npm run railway:touch-api` (grava timestamp em `apps/api/.railway-redeploy`). Commitar os dois juntos para que Railway detecte mudanca em `apps/api/**` e dispare redeploy, que executa `prisma migrate deploy` antes de subir o servidor.
- **Documentacao operacional:** novos guias de uso diario/runbook devem ser criados em `docs/runbook/`.

---

## Memoria operacional — Dashboard e CV Master

- O dashboard principal e `/dashboard` (a rota `dashboard-teste` foi descontinuada).
- A hierarquia esperada do dashboard e: CTA principal → card CV Master → metricas → historico.
- Deve existir apenas um CTA principal de analise (`Analisar nova vaga`) sem duplicatas no historico.
- O card de CV Master usa `/cv-base` para `Cadastrar CV`, `Atualizar CV` e `Ver CV` (download do rawText como .txt).
- Em `/adaptar`, quando houver CV Master, o usuario escolhe entre `Usar meu CV base` e `Enviar outro CV`; sem master, fluxo de upload permanece obrigatorio.
- O historico em `/dashboard` deve usar paginacao por querystring (`page`, `limit`) com opcoes 10/20/50.
- Acoes de download (PDF/DOCX) usam overlay bloqueante com feedback de etapa (`montando` → `concluindo`) ate disparar o arquivo.
- O header da aplicacao e globalmente fixo no topo com 5% de transparencia e sem borda inferior.

---

## Memoria operacional — Estado mais recente

- Freemium consolidado com claim por credito sem redirect forcado, popup de liberacao com fade, padronizacao de CTAs e correcoes de PT-BR nas telas principais.
- Paginas publicas de `Privacidade` e `Termos de Uso` criadas com metadata completa + links discretos no rodape da landing.
- Painel de planos atualizado com plano free e contadores de analise.
- Bug de travamento no back/forward com spinner de transicao permanece pendente e em investigacao.
- Slice `analysis-protection + analysis-observability` implementado (facade protegida, turnstile, rate-limit/dedupe/usage policy, telemetry e funnel idempotente) e integrado no `cv-adaptation` sem mudar UX visivel.
- Referencia operacional oficial do slice: `docs/analysis-protection-operational-runbook.md`.

---

## Verificacao antes de encerrar qualquer entrega

```bash
npm run check
npm run generate --workspace @earlycv/database
npm run build
npm run test
```
