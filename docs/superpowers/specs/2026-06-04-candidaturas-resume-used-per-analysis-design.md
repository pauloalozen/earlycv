# Candidaturas: CV usado por analise em `/candidaturas/[id]`

## Contexto

Na rota `/dashboard_old`, o popup de `Ajustes feitos` exibe o CV usado na analise. Na rota `/candidaturas/[id]`, o mesmo popup existe, mas o dado do CV usado nao aparece de forma confiavel.

O requisito correto e por analise, nao por candidatura: uma mesma candidatura pode ter varias entradas em `cvAdaptations`, e cada analise pode ter sido feita com um CV diferente. Quando a analise usar o perfil master, a UI deve mostrar `CV Master`.

## Problema atual

- A pagina server de `/candidaturas/[id]` ja enriquece cada item de `cvAdaptations` consultando `getCvAdaptation(a.id)` e resolvendo o resume correspondente na lista de resumes do usuario.
- Hoje esse enriquecimento usa a chave `masterResumeTitle`, embora o valor represente o CV usado na analise, que pode ser tanto o `CV Master` quanto um CV comum.
- O contrato tipado de `JobApplicationDetailDto` nao declara esse campo enriquecido por analise, o que deixa a tela dependente de uma propriedade fora do contrato formal.

## Objetivo

Garantir que cada popup `Ajustes feitos` em `/candidaturas/[id]` mostre o CV usado naquela analise especifica:

- `CV Master` quando a analise usou o perfil master
- titulo do CV salvo quando a analise usou um CV nao-master
- fallback explicito apenas quando o dado nao puder ser identificado

## Abordagens consideradas

### 1. Enriquecer cada `cvAdaptation` no server component com `resumeUsedTitle`

Recomendacao.

- Continuar resolvendo o dado por analise em `apps/web/src/app/candidaturas/[id]/page.tsx`
- Renomear o campo enriquecido de `masterResumeTitle` para `resumeUsedTitle`
- Declarar `resumeUsedTitle: string | null` no tipo `JobApplicationDetailDto["cvAdaptations"]`
- Fazer o popup consumir esse campo diretamente da analise selecionada

Vantagens:

- menor mudanca correta
- preserva granularidade por analise
- corrige o nome do contrato para refletir o dominio real
- reduz risco de divergencia entre dados exibidos e analise aberta

Trade-off:

- o dado continua sendo composto no web app, nao na API

### 2. Passar um mapa separado `adaptationId -> resumeUsedTitle`

- A pagina resolveria os titulos, mas passaria um objeto paralelo ao client

Vantagens:

- evita alterar o tipo de `cvAdaptations`

Trade-offs:

- cria duas fontes de verdade para a mesma analise
- aumenta acoplamento entre popup e estrutura externa
- piora manutencao em comparacao com enriquecer o proprio item da analise

### 3. Expor o dado direto da API

- A API de candidaturas retornaria o CV usado em cada analise no proprio DTO

Vantagens:

- contrato de dominio mais completo na origem

Trade-offs:

- escopo maior
- exige mudancas na API para um ajuste que ja pode ser resolvido no server component atual

## Decisao

Adotar a abordagem 1.

Cada item de `application.cvAdaptations` em `/candidaturas/[id]` passara a carregar `resumeUsedTitle`, resolvido individualmente a partir da analise correspondente.

## Design detalhado

### Dados por analise

Para cada adaptacao da candidatura:

1. Buscar o DTO de adaptacao para obter o identificador do resume usado naquela analise
2. Resolver o resume correspondente na lista de resumes do usuario
3. Definir `resumeUsedTitle` com a seguinte regra:
   - `CV Master` quando `resume.isMaster === true`
   - `resume.title` quando for um CV comum
   - `null` quando nao for possivel identificar

### Contrato tipado

Atualizar `apps/web/src/lib/job-applications-api.ts` para que `JobApplicationDetailDto["cvAdaptations"]` declare `resumeUsedTitle: string | null`.

Esse campo sera considerado enriquecimento do server component da rota de detalhe de candidatura, mas ainda assim deve fazer parte do contrato consumido pelo client dessa tela.

### UI

No popup `Ajustes feitos` de `/candidaturas/[id]`, substituir o uso de `masterResumeTitle` por `resumeUsedTitle`.

Texto exibido:

- label continua `CV usado na análise:`
- valor usa `resumeUsedTitle ?? "Não identificado"`

### Consistencia com multiplas analises

O popup deve sempre ler o valor do item de analise atualmente aberto. Nao deve existir nenhum dado compartilhado no nivel da candidatura para preencher esse campo.

Isso garante o comportamento correto quando uma candidatura tiver N analises com CVs diferentes.

## Testes

Adicionar ou ajustar testes em `/candidaturas/[id]` para cobrir:

1. analise com `resumeUsedTitle = "CV Master"`
2. analise com `resumeUsedTitle = "Meu CV Dados"`
3. candidatura com duas ou mais analises, cada uma com `resumeUsedTitle` diferente, validando que o popup mostra o valor correto da analise selecionada
4. fallback `Não identificado` quando o campo vier nulo

## Fora de escopo

- mover essa composicao para a API neste momento
- refatorar `dashboard_old` e `dashboard` para o mesmo nome de campo no mesmo pacote, a menos que isso seja necessario para manter consistencia local de tipagem

## Riscos e mitigacoes

- Risco: manter nome antigo em algum ponto da arvore e parte da UI continuar lendo `masterResumeTitle`
  - Mitigacao: renomeacao completa na rota `/candidaturas/[id]` e ajuste de testes associados
- Risco: candidatura com analises antigas sem resume resolvivel
  - Mitigacao: manter fallback `Não identificado` apenas nesses casos
