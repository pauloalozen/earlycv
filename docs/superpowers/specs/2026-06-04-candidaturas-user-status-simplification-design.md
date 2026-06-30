# Candidaturas: simplificacao dos status visiveis ao usuario

## Contexto

Hoje a interface de candidaturas expõe muitos status ao usuario final, incluindo estados que fazem sentido tecnicamente no dominio, mas aumentam a complexidade perceptiva na UX.

Os tipos internos atuais devem continuar existindo por enquanto, porque eles ja estao espalhados pela API, eventos, filtros, regras automaticas e testes. O ajuste agora e de interface: reduzir o conjunto de opcoes que o usuario pode ver e selecionar, mantendo coerencia semantica com os nomes do dominio existente.

## Objetivo

Reduzir os status visiveis ao usuario para um conjunto canonico e mais claro, sem alterar o modelo interno neste momento.

Status que a interface do usuario deve expor:

- `Salva`
- `Analisada`
- `CV Liberado`
- `Candidatado`
- `Em entrevista`
- `Contratado`
- `Recusado`
- `Desistência`

## Problema atual

- A UI atual expõe estados como `Enviada`, `Em processo`, `Teste / case`, `Oferta`, `Entrevista`, `CV pronto`, `Desisti` e `Recusada`.
- Parte desses estados sao tecnicamente uteis, mas tornam o fluxo mais dificil de entender para o usuario.
- O proximo passo planejado e permitir registrar entrevistas com tipos especificos em popup, entao concentrar a interface em `Em entrevista` agora simplifica a base antes dessa evolucao.

## Abordagens consideradas

### 1. Recomendada: UI canonica com mapeamento para status internos

- Manter os enums/tipos internos como estao
- Expor na UI apenas o conjunto reduzido aprovado
- Mapear cada escolha de UI para um status interno canonico ja existente
- Agrupar visualmente certos estados internos sob um mesmo rótulo de interface

Vantagens:

- menor risco
- nao exige migration de dados nem refactor grande de API
- preserva compatibilidade com regras automaticas e historico existente
- prepara o caminho para o futuro popup de entrevistas

Trade-off:

- a camada de apresentacao passa a ter uma traducao explicita entre status de dominio e status de UX

### 2. Renomear e reduzir os tipos internos agora

- Alterar enums, contratos, eventos e regras para o novo conjunto reduzido

Vantagens:

- dominio e UX ficam com o mesmo vocabulário

Trade-offs:

- escopo muito maior
- alto risco de regressao em API, automacoes e testes
- nao necessario para a melhora imediata da experiencia

### 3. Esconder opcoes sem uma camada canonica clara

- Remover opcoes da UI pontualmente sem consolidar regra de mapeamento

Vantagens:

- mudanca rapida no curtissimo prazo

Trade-offs:

- regra espalhada e dificil de manter
- aumenta a chance de inconsistencias entre listagem, detalhe, stepper e badges

## Decisao

Adotar a abordagem 1.

Os tipos internos permanecem inalterados. A interface do usuario passa a trabalhar com um conjunto canonico reduzido, com mapeamento semantico explicito para os status internos existentes.

## Mapeamento semantico aprovado

### Opcoes selecionaveis na UI

- `Salva` -> `SAVED`
- `Analisada` -> `ANALYZED`
- `CV Liberado` -> `CV_READY`
- `Candidatado` -> `APPLIED`
- `Em entrevista` -> `INTERVIEW`
- `Contratado` -> `HIRED`
- `Recusado` -> `REJECTED`
- `Desistência` -> `WITHDRAWN`

### Estados internos preservados, mas nao expostos como opcao direta

- `IN_PROCESS`
- `ASSESSMENT`
- `OFFER`

Esses estados continuam existindo internamente, mas nao devem aparecer como escolhas manuais ao usuario na interface principal.

## Regras de apresentacao

### Labels de interface

Os nomes visiveis ao usuario devem ficar semanticamente coerentes com a decisao aprovada:

- `CV pronto` -> `CV Liberado`
- `Enviada` -> `Candidatado`
- `Entrevista` -> `Em entrevista`
- `Recusada` -> `Recusado`
- `Desisti` -> `Desistência`

### Agrupamento visual de estados internos

Quando a UI precisar exibir uma candidatura cujo valor persistido seja um dos estados internos preservados abaixo:

- `IN_PROCESS`
- `ASSESSMENT`
- `OFFER`

ela deve agrupar visualmente esses casos sob o rótulo `Em entrevista`, sem alterar o valor persistido agora.

Esse agrupamento deve valer para badges, selects, stepper e demais superficies orientadas ao usuario.

## Impacto funcional esperado

### Rota `/candidaturas`

- filtros e badges devem refletir o conjunto reduzido
- acoes contextuais devem ser revistas para nao dependerem de rótulos antigos visiveis

### Rota `/candidaturas/[id]`

- status badge principal deve seguir o novo vocabulário
- stepper/jornada deve ser simplificado para o conjunto aprovado
- edicao manual de status deve oferecer apenas as opcoes aprovadas

### API e persistencia

- sem mudanca de enum/tipo agora
- sem migration agora
- sem alteracao obrigatoria de payload persistido nesta fase

## Relacao com o futuro popup de entrevistas

`Em entrevista` passa a ser o ponto canonico de UX para qualquer etapa intermediaria de conversa/avaliacao.

No passo seguinte, o popup podera capturar o tipo de entrevista e permitir registrar varias entrevistas sem reabrir a discussao de nomes de status.

## Fora de escopo

- alterar enums/tipos internos de status neste momento
- migrar dados existentes
- redesenhar agora o popup de entrevista e seus tipos detalhados
- refatorar eventos historicos persistidos

## Riscos e mitigacoes

- Risco: estados internos antigos continuarem vazando em alguma tela
  - Mitigacao: centralizar o mapeamento de status de UX e reutiliza-lo nas telas de candidaturas
- Risco: filtros e stepper ficarem inconsistentes com os novos labels
  - Mitigacao: aplicar a mesma camada canonica em badges, filtros, select de status e jornada
- Risco: `Candidatado` soar incomum em alguns contextos
  - Mitigacao: manter exatamente o nome aprovado nesta fase para consistencia com a decisao de produto e revisar copy depois se necessario
