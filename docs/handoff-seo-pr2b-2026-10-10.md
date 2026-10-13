# Handoff SEO PR 2b — 2026-10-10

Substitui `docs/handoff-seo-pr2b-2026-10-09.md` (que fica só como histórico).

## Estado

- PR #65 aberto contra develop: https://github.com/pauloalozen/earlycv/pull/65
- Branch `feature/seo-2b-dados-de-vaga`, 14 commits sobre develop, working tree limpo, push feito (último: 987c75e).
- Itens 5 a 12 do handoff de 09/10 implementados, mais as rodadas de ajuste do Paulo (abaixo).
- Nada em main/prod. Merge e rollout ficam com o Paulo.
- O rollout do SEO 2a (PRs #63/#64, já em develop) em prod também segue pendente.

## O que o PR faz além dos itens 5–12

1. **Predicado único `shouldEmitJobPosting`** (`@earlycv/config/job-posting`): a vaga emite JobPosting se não for banco de talentos e o país for BR. Vale para o JSON-LD da web e para a fila da Indexing API.
2. **Fila da Indexing API**:
   - URL_UPDATED só é enfileirado para vaga com JobPosting, e o worker reconfere antes de enviar.
   - URL_DELETED só é enfileirado se a vaga já teve URL_UPDATED com SUCCESS no GoogleIndexingLog (`wasNotifiedToGoogle`), e o worker reconfere.
   - Item que não passa na reconferência do worker é marcado como skipped.
   - Ordem do worker: primeiro UPDATED de vaga nova (prioridade 10), depois DELETED, por último o backfill (prioridade 20).
   - DELETED tem piso de 60 envios/dia (`INDEXING_DELETED_DAILY_FLOOR`), reservado da cota de 200.
   - O painel da fila mostra os enviados hoje por tipo.
3. **Backfill**: o SQL aplica o filtro de vaga pública (título e descrição não vazios, área diferente de OTHER, sem talent_pool), e o predicado TS é aplicado na paginação.
4. **Scripts pós-deploy**: rodam em dry-run por padrão, gravam com `--apply` e informam quantas pendências vão criar. Só enfileiram vaga ativa que passa a ter JobPosting.
   - `jobs:regenerate-slugs`: só vagas `[Job-N]`. Empresa reatribuída só entra com `--include-company-changed`, depois de revisão.
   - `jobs:normalize-employment-types`
   - `jobs:normalize-locations`: compara com a regra anterior ao PR, enfileira com prioridade 20 e grava `contentUpdatedAt`.
5. `companies.e2e-spec` passou a usar `/api/companies/paginated?search=`, em commit separado.

## Números medidos no homolog (local, só leitura)

**Pendências que cada script cria:**

| Script | Vagas | Pendências |
|---|---|---|
| `jobs:regenerate-slugs` | 569 `[Job-N]` | 167 |
| `jobs:normalize-employment-types` | 13.770 (2.656 com mudança visível) | 0 |
| `jobs:normalize-locations` | 1.896 | 384 (159 só pela regra nova) |

**Teste "uma vez só" do normalize-locations** (cópia `pg_dump` do homolog, já apagada):

| Execução | Pendências criadas | Vagas gravadas |
|---|---|---|
| 1ª `--apply` | 384 | 2.055 |
| 2ª, logo em seguida | 0 | 0 |
| 3ª, após simular os envios | 0 | 0 |

**DELETED de 01/10 a 08/10:**
- 2.055 no total; 319 (15,5%) seriam evitados pela nova regra e 1.736 continuariam.
- Pico em 07/10: 970 dos que continuariam.

**Demanda estimada contra a cota de 200/dia:**

| Tipo | Média | Detalhe |
|---|---|---|
| DELETED que continuam | ~128/dia | ~248 contando o pico |
| UPDATED de vaga nova | ~118/dia | ~160 em dia útil, ~1 no fim de semana |

- Em dia útil a demanda passa da cota: saem 140 UPDATED e 60 DELETED.
- No fim de semana a fila de DELETED e o backfill alcançam.

## Pendências e em aberto

- Revisão e merge do PR #65 (Paulo).
- Na ordem do rollout em prod (Paulo):
  1. Migration `20261010120000` (Job.employmentTypeRaw, Company.displayName).
  2. Deploy.
  3. Scripts em dry-run.
  4. `--apply`.
- Fora do PR:
  - 2 vagas PremierSoft com banco de talentos só no slug.
  - Tipos de contratação sem mapa (associate, lecturer, parter, outsource, cooperado) viram null.
  - Vaga não remota sem cidade tem JobPosting só com país BR.
  - Empresas reatribuídas (3.686 vagas, 506 pares) esperam revisão antes de `--include-company-changed`.
- Depois do deploy, vale acompanhar no painel da fila se o piso de 60 DELETED dá conta da demanda; se a fila de DELETED só crescer, rever o piso.

## Ambiente local

- O download do beBee (`discover:bebee-sources`, PID 16994) continua rodando no banco `earlycv`. Não interromper e seguir as restrições de 09/10.
- Dados de teste ficam em `earlycv_homolog` (o `DATABASE_URL` do `.env` aponta para ele); testes da API usam `earlycv_test`.
- Não há servidor local meu de pé.
