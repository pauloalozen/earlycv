# Dashboard + CV Master (2026-04-10)

- Dashboard principal consolidado em `/dashboard`.
- Prioridade visual: CTA principal unico (`Analisar nova vaga`), depois CV Master, metricas e historico.
- Card CV Master:
  - sem master: `Cadastre seu CV base` + `Cadastrar CV`.
  - com master: `Seu CV base esta pronto` + `Atualizar CV` e `Ver CV`.
- Acao de CV Master aponta para `/meus-cvs` (sem criar novas paginas).
- Fluxo `/adaptar` com bifurcacao:
  - `master`: cria adaptacao com `masterResumeId` e redireciona para `/adaptar/[id]/resultado`.
  - `upload`: fluxo existente preservado (analyze guest).

## Estado de sincronizacao (2026-04-11)

- Local e remoto sincronizados em `main`.
- Fluxo de trabalho definido: operar em `main` por padrao, sem worktrees/paralelismo sem solicitacao explicita.
- Correcao de estabilidade de testes aplicada:
  - senhas de fixtures e2e alinhadas com politica atual (maiuscula obrigatoria);
  - expectativas de scripts do workspace config atualizadas;
  - testes da API serializados (`--test-concurrency=1`) para evitar intermitencia de engine Prisma.
