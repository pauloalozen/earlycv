# Dashboard Principal + CV Master Design

## Contexto

O dashboard principal foi promovido a partir da rota de teste e agora precisa de refinos de UX/UI para aumentar clareza de ação, reduzir redundância e reforçar percepção de valor. Em paralelo, o produto precisa introduzir o conceito de CV Master reutilizável sem quebrar APIs, sem criar novas páginas e mantendo a linguagem visual atual (clean, fundo claro, acento consistente).

## Objetivo

1. Tornar `Analisar nova vaga` a ação principal inequívoca da tela.
2. Remover ações duplicadas que competem por atenção.
3. Melhorar hierarquia visual e microcopy de resumo/métricas.
4. Introduzir CV Master no dashboard e no fluxo de análise para reduzir fricção de upload recorrente.

## Escopo

### Inclui

- Ajustes de layout e copy em `apps/web/src/app/dashboard/page.tsx`.
- Novo card de CV Master no dashboard, com estados sem/ com CV Master.
- Integração real com endpoint existente de resumes (`GET /resumes`) para detectar CV Master.
- Ajuste do fluxo de `apps/web/src/app/adaptar/page.tsx` para oferecer:
  - `Usar meu CV base` (quando houver master)
  - `Enviar outro CV` (fluxo atual)
- Criação de adaptação via `POST /cv-adaptation` usando `masterResumeId` quando o usuário optar pelo CV Master.

### Não inclui

- Novas páginas ou novas rotas dedicadas a CV Master.
- Alteração de contratos existentes da API.
- Mudanças de identidade visual geral do produto.

## Arquitetura Funcional

### 1) Dashboard (server-rendered)

- Continua em `apps/web/src/app/dashboard/page.tsx`.
- Mantém coleta de plano, histórico e sinais de análise já existentes.
- Adiciona consulta de CV Master do usuário com utilitário server-side no web app.
- Nova hierarquia de seções:
  1. CTA principal (dominante)
  2. Card CV Master
  3. Métricas
  4. Histórico

### 2) Detecção de CV Master

- Criar utilitário em `apps/web/src/lib/resumes-api.ts` para consumir `GET /resumes` via `apiRequest`.
- Estrutura mínima necessária de DTO no frontend:
  - `id`
  - `title`
  - `sourceFileName`
  - `isMaster`
  - `updatedAt`
- Resolver master como primeiro item com `isMaster === true`.

### 3) Fluxo `/adaptar`

- Página continua client component (`apps/web/src/app/adaptar/page.tsx`).
- Buscar status de autenticação + CV Master no carregamento.
- Se usuário autenticado e com CV Master:
  - mostrar seletor de modo antes do upload.
  - modo padrão recomendado: `Usar meu CV base` (menos fricção).
- Se sem CV Master ou falha de carregamento:
  - manter fluxo atual de upload obrigatório.

## UX/UI Detalhado

## Dashboard

### CTA principal

- Botão `Analisar nova vaga` com destaque visual:
  - altura `h-12` (ou equivalente)
  - maior padding horizontal
  - centralizado no card de ação
  - contraste alto com cor primária atual
- Microcopy abaixo: `Leva menos de 2 minutos`.

### Redundâncias

- Remover botão duplicado `Analisar nova vaga` do cabeçalho do histórico.
- Remover card final de plano/ação que compete com CTA principal.

### Resumo rápido (topo)

- Trocar título para `Visão geral` (aprovado na sessão).
- Labels com `text-sm` e tom cinza.
- Valores com `text-xl`/`text-2xl` e maior contraste.
- Texto orientado ao resultado:
  - `X CVs analisados`
  - `Y versões geradas`
  - `Z créditos disponíveis`

### Métricas

- Mesma estrutura de cards com borda leve + `shadow-sm`.
- Ajuste de microcopy:
  - `Seu score médio`
  - `Vagas que combinam com você`
  - `Melhoria recente`

### Histórico

- Preservar estrutura e funcionalidades existentes.
- Manter score e melhoria (+%).
- Garantir espaçamento confortável (`p-4`/`p-5`).
- Não incluir novos CTAs.

## Card CV Master

Posição: abaixo do CTA principal e antes das métricas.

### Estado sem master

- Título: `Cadastre seu CV base`
- Descrição: `Evite subir seu currículo toda vez. Use um CV base para todas as análises.`
- Ação: `Cadastrar CV` -> `/meus-cvs`

### Estado com master

- Título: `Seu CV base está pronto`
- Descrição: `Você pode usá-lo em novas análises`
- Metadados opcionais:
  - nome do arquivo/título
  - data de atualização
- Ações:
  - `Atualizar CV` -> `/meus-cvs`
  - `Ver CV` -> `/meus-cvs`

## Fluxo de Análise com CV Master

### Quando existe CV Master

- Exibir escolha:
  - `Usar meu CV base`
  - `Enviar outro CV`
- Se `Usar meu CV base`:
  - não exige upload de arquivo
  - envia `masterResumeId` + `jobDescriptionText` para `POST /cv-adaptation`
  - redireciona para `/adaptar/[id]/resultado`
- Se `Enviar outro CV`:
  - mantém fluxo atual com upload e análise guest

### Quando não existe CV Master

- Fluxo atual inalterado (upload obrigatório).

## Erros e Degradação Graciosa

- Falha ao listar resumes: não bloquear uso; cair para fluxo atual (upload).
- Falha ao criar adaptação com master: exibir erro amigável e permitir alternar para `Enviar outro CV`.
- Sem impacto em endpoints existentes ou em estrutura de dados persistidos.

## Arquivos Planejados

- Modificar: `apps/web/src/app/dashboard/page.tsx`
- Modificar: `apps/web/src/app/adaptar/page.tsx`
- Criar: `apps/web/src/lib/resumes-api.ts`

## Critérios de Aceite

1. Dashboard apresenta uma única ação principal clara (`Analisar nova vaga`) sem duplicidades de CTA.
2. Resumo e métricas exibem microcopy revisada com melhor legibilidade e hierarquia.
3. Card CV Master aparece na posição definida com estado correto sem/ com master.
4. `Cadastrar CV`, `Atualizar CV` e `Ver CV` direcionam para `/meus-cvs`.
5. Em `/adaptar`, quando há master, usuário pode escolher entre usar base ou enviar outro CV.
6. Fluxo `Enviar outro CV` continua funcionando como antes.
7. Nenhuma API existente é quebrada; apenas consumo adicional de endpoints já disponíveis.

## Riscos e Mitigações

- **Risco:** aumento de complexidade no client flow de `/adaptar`.
  - **Mitigação:** isolar lógica de modo (`base` vs `upload`) com estado explícito e validações simples.
- **Risco:** inconsistência visual entre novos blocos e cards atuais.
  - **Mitigação:** reutilizar classes e tokens já praticados no dashboard.
- **Risco:** usuários não autenticados em `/adaptar`.
  - **Mitigação:** manter comportamento atual e mostrar opções de master apenas quando autenticado + dado disponível.
