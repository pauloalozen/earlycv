<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# EarlyCV

- EarlyCV e um SaaS copilot para candidaturas no Brasil, com foco inicial em tecnologia, dados, produto, analytics/BI e funcoes digitais adjacentes.
- Proposta central: descobrir vagas cedo em portais de carreira, explicar a aderencia entre curriculo e vaga e adaptar curriculos sem inventar fatos.
- Regra de produto inegociavel: nunca inventar experiencias, cargos, resultados, certificacoes, tecnologias ou responsabilidades; toda adaptacao precisa preservar rastreabilidade para fatos reais do curriculo/perfil.
- `first_seen_at` e sinal central de produto e deve permanecer visivel em modelagem, ranking, alertas e UX quando relevante.
- Direcao de monorepo: `apps/web`, `apps/api`, `packages/config`, `packages/database`, `packages/queue`, `packages/storage`, `packages/ai`.
- `apps/web` fala apenas com `apps/api`; `apps/api` concentra regras de negocio e orquestracao de infraestrutura.
- Stack principal: Next.js App Router, TypeScript, Tailwind CSS v4, Biome.
- Diretriz visual antiga (laranja/terracota) esta descontinuada e nao deve mais ser utilizada.
- Nova diretriz ativa: linguagem monocromatica escura-sobre-clara nas paginas de usuario, conforme `CODE_GUIDELINES.md` (secao 7); manter laranja fora do produto por enquanto.
- Componentes genericos reutilizaveis ficam no pacote de UI compartilhada do monorepo; enquanto essa extracao nao acontece, use `apps/web/src/components/ui` no app web e siga tambem `apps/web/src/components/ui/AGENTS.md`.
- SEO e requisito de produto: toda rota publica deve sair com metadata completa, canonical, OG/Twitter, robots e structured data quando fizer sentido.
- Vagas publicas devem ter URL dedicada, conteudo renderizado no servidor e `JobPosting` estruturado.
- Rotas internas, utilitarias ou de showcase normalmente devem usar `noindex`.
- Estado atual do backend-core: `packages/database` ja tem schema Prisma real + migration inicial + seed; `apps/api` ja integra auth, profiles, resumes, companies, job-sources e jobs em `AppModule`.
- Surface atual obrigatorio de env da API: `DATABASE_URL`, `API_HOST`, `API_PORT`, `JWT_*`, `GOOGLE_*` e `LINKEDIN_*`; confira `.env.example` antes de rodar `apps/api`.
- Amanhã, se o pedido for apenas "retomar projeto", leia primeiro `specs/backend-core-slice-1-handoff.md` e siga para a fase de ingestao em vez de reabrir a fundacao.
- Proximo passo esperado: modulo de ingestao sobre `Company`, `JobSource` e `Job`, preservando `canonicalKey` e `firstSeenAt` como invariantes do produto.
- Slice de protecao e observabilidade da analise de CV foi implementado em `apps/api/src/analysis-protection` e `apps/api/src/analysis-observability`, com boundary obrigatorio no `cv-adaptation`.
- O fluxo `/cv-adaptation/analyze-guest` agora exige token turnstile encaminhado pelo web app, com cobertura dedicada em testes de API e web submit-flow.
- Runbook operacional oficial da protecao/observabilidade: `docs/analysis-protection-operational-runbook.md` (checklists diarios/semanais, rollback e incident playbooks).
- Convencao de documentacao operacional: novos guias de uso diario/runbook devem ser criados em `docs/runbook/`.
- Convencao Railway/migrations: toda nova migration Prisma deve ser acompanhada de `npm run railway:touch-api` (grava timestamp em `apps/api/.railway-redeploy`). Commitar os dois juntos para que Railway detecte mudanca em `apps/api/**` e dispare redeploy, que executa `prisma migrate deploy` antes de subir o servidor.
