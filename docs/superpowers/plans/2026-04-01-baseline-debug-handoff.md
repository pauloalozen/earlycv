# Baseline debug handoff - 2026-04-01

## Onde paramos

- Trabalho feito em worktree isolado: `.worktrees/admin-users-integration`
- Branch do worktree: `integrate/admin-users-superadmin`
- Objetivo atual: estabilizar a baseline antes de integrar `feature/admin-users-superadmin`

## O que ja foi confirmado

- O problema original de `admin/usuarios` e token nao era perda de codigo; a implementacao existe em `feature/admin-users-superadmin`
- O `main` atual ainda esta no estado antigo, com placeholders de Fase 3 para usuarios/perfis/curriculos

## Causas raiz investigadas na baseline

### 1) Prisma Client nao era gerado automaticamente em ambiente limpo

- No worktree limpo, `npm test` falhava em `packages/database` porque `@prisma/client` nao estava pronto
- Foi adicionada a correcao local no worktree:
  - `package.json`: script `pretest` roda `npm run generate --workspace @earlycv/database`

### 2) API dependia de `apps/api/.env.test` inexistente

- `apps/api/package.json` falhava porque tentava carregar `./.env.test`, mas esse arquivo nao esta versionado
- Foi adicionada a correcao local no worktree:
  - fallback para `../../.env`
  - fallback final para `../../.env.example`
- O teste de contrato foi atualizado em `packages/config/src/workspace-bootstrap.spec.ts`

## Estado apos essas correcoes

- `@earlycv/config`: passando
- `@earlycv/database`: passando
- `@earlycv/api`: avancou, mas revelou nova falha estrutural no banco

## Novo bloqueio encontrado

- Os testes de resume da API falham com erro de coluna ausente: `Resume.isPrimary`
- O schema atual e as migrations do repo esperam `isPrimary`
- Mas o banco real conectado nos testes ainda tem colunas antigas como:
  - `basedOnResumeId`
  - `isMaster`
  - `kind`
  - `templateId`
- Ao mesmo tempo, a tabela `_prisma_migrations` informa que as migrations atuais ja foram aplicadas

## Diagnostico atual

- Existe drift entre o schema real do banco local e o historico de migration presente no repo
- O Prisma reporta "Database schema is up to date" com base no historico, mas a tabela `Resume` real nao bate com o schema atual

## Recomendacao para amanha

- Nao continuar usando o banco local atual como baseline de teste
- Criar/usar um banco de teste dedicado e resetavel para a suite
- So depois retomar a integracao de `feature/admin-users-superadmin`

## Arquivos alterados no worktree

- `package.json`
- `apps/api/package.json`
- `packages/config/src/workspace-bootstrap.spec.ts`

## Proximo passo exato

- Ajustar a baseline de testes para usar um banco de teste separado, reprodutivel e sem drift
- Reexecutar `npm test` no worktree
- So entao voltar para integrar `feature/admin-users-superadmin`
