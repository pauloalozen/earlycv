# Handoff — Implementação: Reprodutibilidade da Análise de CV

**Para:** agente de implementação.
**Data:** 2026-06-05.

## Leitura obrigatória (nesta ordem)

1. `AGENTS.md` (raiz) — regras do projeto, invariantes, git workflow, verificação.
2. `docs/superpowers/specs/2026-06-05-cv-analysis-reproducibility-design.md` — o *quê* e o *porquê*.
3. `docs/superpowers/plans/2026-06-05-cv-analysis-reproducibility-implementation.md` — o *como*, task por task.

> Use **sempre a versão do repo** desses arquivos (não cópias antigas). A numeração de seções da spec foi revisada: o gating de segurança agora é **§6.8** (não §6.4); §6.4 é "Medição de score".

## Como executar

- Implemente o plano **task por task, na ordem do §14.1**. Não pule tasks.
- **TDD:** escreva o teste que falha primeiro, confirme o FAIL, só então implemente. O plano já está nesse formato.
- Cada task termina com os testes passando antes de avançar.

## Decisão de fluxo (NÃO reabrir)

- **Chamada A (diagnóstico)** roda na **análise gratuita / pré-pagamento**.
- **Chamada B (geração do CV adaptado)** roda **somente após pagamento/liberação de crédito**.
- O **CV adaptado completo não existe antes do pagamento**.
- **`scoreDepois`** só existe **após** a Chamada B gerar o JSON adaptado.
- Pré-pagamento só existe: `scoreAntes`, diagnóstico, lacunas, recomendações e `adaptationPlanJson`. Para o "depois", apenas linguagem **qualitativa/conservadora** — nunca um número medido.

## Regras inegociáveis

- **Não começar pela refatoração comercial.** Não mexer em gating/pagamento no início.
- **Não ativar nada para 100% do tráfego.** Rollout por feature flag em fases (Task 15: Fase 0 off → 1 admin/test → 2 allowlist → 3 % pequeno → 4 amplo).
- Fluxo **legado continua como fallback** atrás de flag (Tasks 8 e 15). Não remover o caminho legado durante o rollout.
- **LLM nunca calcula score** — o score é exclusivamente do scorer determinístico em código.
- **Nunca inventar** experiência/competência/resultado na Chamada B.
- **Logs, erros e métricas nunca contêm CV completo, vaga completa ou JSON adaptado completo** — só IDs, hashes, `correlationId` e metadados não sensíveis.
- Comparar scores só dentro da mesma `rubricVersion`/`aliasVersion`.

## Gates de parada (pare e mostre o resultado antes de avançar)

1. **Task 6** — comparação score novo × score legado (golden set Fase A). Não avançar para geração se o scorer não estiver calibrado dentro da banda (spec §5.5).
2. **§9 (gate de qualidade de conteúdo)** — comparação baseline × novo da Chamada B. Não fazer rollout se houver regressão de qualidade humana ou qualquer fato inventado.

## Pendências — NÃO chutar, perguntar ao Paulo

- Pesos/thresholds da Experiência (spec §5.3) e banda final (§5.5).
- Limite máximo de custo médio por análise (gate de rollout, §13).
- `aliasVersion` separada de `rubricVersion` já na v1? (§11.1) — define a unicidade do `JobRequirementSet` (Task 1).
- Modelo de embedding e custo (§13).

## Convenções do projeto

- **Git:** confirme a branch (`git branch --show-current`). Crie uma feature branch a partir de `develop` atualizado (`git checkout develop && git pull && git checkout -b feature/cv-analysis-reproducibility`). Nunca commitar direto em `main`.
- **Migrations Prisma:** toda nova migration → `npm run railway:touch-api` e commitar o `.railway-redeploy` junto.
- **Produção com pagantes:** não quebrar fluxos ativos. Mudança sensível.
- **Antes de encerrar qualquer entrega:**
  ```bash
  npm run check
  npm run generate --workspace @earlycv/database
  npm run build
  npm run test
  ```

## Lembretes onde modelos menores costumam escorregar

- O plano **não** é uma lista para fazer tudo de uma vez — cada task tem teste e alguns têm gate.
- **Task 14 (preenchimento de campos faltantes) é fase posterior de propósito** — só depois do fluxo base validado (Tasks 1–13). Não puxar para junto do fluxo base.
- A v1 usa **duas chamadas** (`JobRequirementSet` + `diagnoseCv`); a otimização para uma só está **fora de escopo da v1**.
- O scorer roda sobre `CanonicalCvProfile` único (Task 3): CV original e JSON adaptado normalizados para o mesmo formato antes do scoring.
