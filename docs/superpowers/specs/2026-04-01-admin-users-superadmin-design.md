# Admin Users + Superadmin Design

**Data:** 2026-04-01

## Objetivo

Expandir o backoffice da EarlyCV para cobrir a manutencao operacional de contas, perfis e curriculos de usuarios do produto, ao mesmo tempo em que nasce uma area separada de `Superadmin` para operacao sensivel, governanca interna e futura evolucao para `ghost mode`.

## Decisao central

O sistema passa a ter duas areas administrativas explicitas:

- `/admin/*` para operacao cotidiana e manutencao de usuarios do produto
- `/superadmin/*` para governanca, configuracoes sensiveis, correcoes sistêmicas e administracao de equipe interna

Essa separacao evita misturar operacao normal com poderes excepcionais e deixa clara a diferenca entre suporte do dia a dia e intervencao privilegiada no sistema.

## Regras de origem das contas

### Usuarios do produto

- usuarios comuns continuam sendo criados apenas pelos fluxos normais do produto
- `admin` e `superadmin` nao criam manualmente contas de usuarios comuns nesta fase

### Contas internas

- `superadmin` pode criar e manter contas internas de staff para operar o sistema
- essas contas internas podem receber papeis como `admin` e `superadmin`
- `admin` nao cria contas administrativas

## Principio operacional

Os modulos novos seguem o mesmo principio do admin operacional ja existente:

- mostrar o que existe
- mostrar o que esta incompleto, inconsistente ou com problema
- mostrar a proxima acao recomendada

O objetivo nao e apenas expor CRUD generico, mas oferecer manutencao orientada a suporte e continuidade.

## Estrutura das areas

### 1. Area `/admin`

Responsavel por manutencao operacional dos usuarios do produto e seus recursos associados.

Rotas previstas nesta fase:

- `/admin/usuarios`
- `/admin/usuarios/[id]`
- `/admin/perfis`
- `/admin/perfis/[id]`
- `/admin/curriculos`
- `/admin/curriculos/[id]`

Os placeholders atuais desses modulos deixam de existir e passam a ser superficies operacionais reais.

### 2. Area `/superadmin`

Responsavel por operacao privilegiada, governanca e manutencao de equipe interna.

Rotas previstas nesta fase:

- `/superadmin`
- `/superadmin/equipe`
- `/superadmin/equipe/[id]`
- `/superadmin/configuracoes`
- `/superadmin/correcoes`
- `/superadmin/suporte`

Nem todas precisam nascer completas na mesma profundidade, mas a shell, a identidade da area e a fronteira de permissao precisam existir desde ja.

## Papeis e permissoes

### Usuario comum

- acessa apenas o fluxo normal do produto
- nao acessa `admin` nem `superadmin`

### Admin

Pode operar os modulos de manutencao do produto em `/admin`:

- listar e inspecionar usuarios do produto
- editar dados basicos permitidos
- ajustar plano
- ajustar status operacional da conta
- revisar e corrigir perfil
- revisar e corrigir curriculos
- ajustar curriculo principal
- iniciar impersonacao leve de inspecao

Nao pode:

- criar contas administrativas
- executar acoes sistêmicas privilegiadas
- operar gestao ampla de credenciais, sessoes e provedores sensiveis
- acessar ferramentas reservadas ao `superadmin`

### Superadmin

Pode:

- fazer tudo que o `admin` faz
- criar, editar, ativar e desativar contas internas de staff
- conceder ou revogar papel administrativo permitido
- acessar configuracoes sensiveis e trilhas de correcao sistêmica
- operar a futura base de suporte avancado

## Modulo de usuarios (`/admin/usuarios`)

### Objetivo

Centralizar manutencao de contas do produto, sem criar usuarios comuns manualmente.

### Lista de usuarios

Deve oferecer:

- busca por nome, email e id
- filtros por status da conta
- filtros por plano
- filtros por origem de conta quando esse dado existir
- filtros por completude operacional
- sinais de ultima atividade quando o dado existir

Cada linha deve responder rapidamente:

- quem e o usuario
- em que estado a conta esta
- se ha perfil
- se ha curriculo principal
- se existe alguma pendencia operacional associada

### Detalhe do usuario

Deve reunir numa unica tela:

- dados basicos da conta
- plano atual
- status atual
- timestamps relevantes
- vinculo com perfil
- vinculo com curriculos
- pendencias abertas
- acoes operacionais permitidas

### Acoes do modulo

Nesta fase, `admin` e `superadmin` podem:

- corrigir nome e campos basicos permitidos
- ajustar plano
- ajustar status da conta dentro da politica definida
- navegar para o perfil relacionado
- navegar para curriculos relacionados
- marcar qual curriculo e principal
- iniciar impersonacao leve de inspecao

## Modulo de perfis (`/admin/perfis`)

### Objetivo

Permitir leitura e manutencao completa do perfil do usuario no contexto de suporte e qualidade operacional.

### Lista de perfis

Deve permitir:

- busca por usuario, email ou id de perfil
- filtros por completude
- filtros por ausencia de campos importantes

Campos-chave de completude desta fase:

- headline
- resumo
- localizacao
- preferencia remota
- senioridade ou sinais equivalentes ja existentes

### Detalhe do perfil

Deve mostrar:

- dono do perfil
- estado de completude
- campos preenchidos e ausentes
- alertas de inconsistencia
- historico basico de atualizacao quando houver dado disponivel

### Acoes do modulo

- editar o perfil em contexto administrativo
- corrigir campos faltantes ou inconsistentes
- voltar rapidamente para a conta do usuario

## Modulo de curriculos (`/admin/curriculos`)

### Objetivo

Permitir manutencao global dos curriculos dos usuarios, incluindo upload de arquivo, estado de processamento, vinculo, parsing assistido e curriculo principal.

### Fluxo base do curriculo

O fluxo esperado do produto para curriculos nesta fase e:

- o usuario envia um arquivo em `pdf` ou formato de documento compativel, como `doc` ou `docx`
- o sistema faz parsing do arquivo enviado
- esse upload origina o `CV master` da conta
- o parsing ajuda no preenchimento automatico dos dados estruturados do curriculo master
- a partir do `CV master`, o sistema deve conseguir sustentar no futuro CVs adaptados para vagas ou cargos especificos
- os CVs adaptados tambem podem usar templates otimizados disponibilizados pela operacao interna
- o resultado pode exigir revisao, correcao manual ou intervencao administrativa quando houver falha ou inconsistência

O admin nao substitui esse fluxo do produto, mas precisa conseguir inspecionar e corrigir seus resultados.

### Modelo conceitual do curriculo

Cada usuario deve poder ter:

- um `CV master`, que representa a base principal enviada pela pessoa usuaria
- varios CVs derivados ou adaptados, ligados a vagas, cargos ou objetivos especificos
- acesso a templates de curriculo otimizados, publicados pela equipe interna, para orientar ou estruturar adaptacoes

Consequencias para a arquitetura desta fase:

- o modelo de curriculo nao deve assumir que existe apenas um unico curriculo relevante por usuario
- o conceito de `curriculo principal` precisa ser reinterpretado como curriculo base ou `master`
- curriculos adaptados precisam caber naturalmente na estrutura, sem exigir reestruturacao futura do modulo
- o admin precisa distinguir claramente quando esta vendo o `CV master` e quando esta vendo um curriculo adaptado
- a plataforma precisa comportar templates reutilizaveis de curriculo, separados dos curriculos do usuario, mas consumiveis no fluxo de adaptacao

### Lista de curriculos

Deve permitir:

- busca por usuario, titulo, id ou status
- filtros por status do curriculo
- filtros por `master` / adaptado
- filtros por problemas operacionais
- filtros por origem do curriculo enviado e por falha de parsing quando esses dados existirem

### Detalhe do curriculo

Deve mostrar:

- usuario dono
- status do curriculo
- se e `master` ou adaptado
- qual vaga, cargo ou contexto originou a adaptacao quando houver
- metadados basicos do arquivo quando existirem
- tipo do arquivo original quando existir
- estado do parsing e sinais de falha ou processamento incompleto
- campos textuais ou estruturados relevantes ja persistidos
- inconsistencias operacionais detectadas

### Acoes do modulo

- editar campos permitidos do curriculo
- ajustar status
- definir ou corrigir qual curriculo e o `master`, respeitando a politica final do produto
- navegar para o usuario dono
- revisar resultado do parsing quando houver divergencia relevante
- corrigir manualmente dados extraidos quando o preenchimento automatico vier incompleto ou incorreto

Nesta fase, o foco administrativo recai principalmente sobre o `CV master` e sobre a consistencia da relacao entre curriculo base e curriculos adaptados.

## Superadmin: equipe interna

### Objetivo

Dar ao `superadmin` o controle das contas internas que operam o sistema.

### Lista de equipe

Deve permitir:

- listar operadores internos
- filtrar por papel
- filtrar por status
- entender rapidamente quem tem acesso privilegiado

### Acoes da equipe

Somente `superadmin` pode:

- criar conta interna de staff
- editar dados da conta interna
- ativar, suspender ou desativar acesso
- atribuir papel administrativo suportado

Essa superficie trata apenas contas internas. Nao deve ser confundida com o cadastro de usuarios do produto.

## Superadmin: configuracoes, correcoes e suporte

Nesta fase, a area `Superadmin` ja nasce visualmente e conceitualmente separada, mesmo que algumas telas comecem em escopo menor.

### `/superadmin`

- dashboard inicial da area sensivel
- atalhos para equipe, configuracoes, correcoes e suporte

### `/superadmin/configuracoes`

- ponto inicial para concentrar ajustes administrativos sensiveis
- nao precisa absorver todas as configuracoes do sistema nesta fase

### `/superadmin/correcoes`

- superficie para intervencoes sistêmicas e operacoes mais sensiveis
- deve nascer com foco em separacao institucional, nao em volume de funcionalidades

### `/superadmin/suporte`

- ponto de entrada para capacidades futuras de suporte avancado
- serve como base natural para o futuro `ghost mode`

## Templates de curriculo otimizados

### Objetivo

Permitir que `admin` e `superadmin` publiquem templates de CV otimizados para diferentes estrategias de apresentacao, de modo que usuarios do produto possam escolher uma base estrutural para adaptar seus curriculos.

### Papel dos templates

Templates nao substituem o `CV master` do usuario.

Eles funcionam como ativos de apoio que:

- orientam o formato final de um CV adaptado
- ajudam a padronizar apresentacoes mais fortes para certos contextos
- servem como base reutilizavel para diferentes vagas ou cargos

### Regras de uso

- o usuario comum continua tendo seu proprio `CV master` como fonte primaria de dados
- um CV adaptado pode combinar dados do `CV master` com um template otimizado escolhido
- templates sao geridos internamente, nao enviados por usuarios comuns

### Origem e governanca

- `admin` e `superadmin` podem subir templates de CV otimizados
- `superadmin` continua tendo controle mais sensivel sobre governanca, mas o modulo precisa comportar publicacao operacional por staff autorizado
- templates precisam ter metadados suficientes para classificacao, ativacao e manutencao

### Dados minimos do template

- nome do template
- descricao curta
- objetivo ou tipo de uso
- arquivo base e/ou estrutura equivalente
- status ativo/inativo
- metadados de categoria quando fizer sentido

### Consequencias para a arquitetura

- templates precisam existir como entidade separada de `Resume`
- o fluxo de curriculos adaptados deve poder referenciar um template escolhido
- o admin precisa conseguir distinguir claramente curriculo do usuario versus template institucional
- a modelagem deve evitar misturar ativos globais do sistema com documentos pessoais do usuario

## Impersonacao leve de inspecao

### Objetivo

Permitir que `admin` e `superadmin` entendam o estado de uma conta sem introduzir ainda o `ghost mode` completo.

### Caracteristicas desta fase

- a sessao deve ser explicitamente assistida
- a UI deve exibir banner persistente indicando o contexto de inspecao
- a funcionalidade serve para visualizar, diagnosticar e validar configuracao da conta

### O que ela permite

- inspecionar o estado do usuario
- entender por que onboarding, perfil ou curriculo estao quebrados ou incompletos
- validar a experiencia em contexto assistido

### O que ela nao faz ainda

- nao oculta que a sessao e assistida
- nao simula falhas artificiais
- nao vira `ghost mode` pleno
- nao deve abrir um caminho opaco para acoes sensiveis invisiveis

## Integracao com pendencias

O modulo atual de `Pendencias` passa a incorporar pendencias de conta e completude, alem das pendencias de ingestao.

Tipos iniciais desta fase:

- usuario sem perfil
- perfil incompleto
- usuario sem `CV master`
- curriculo com status problematico
- curriculo com parsing falho ou incompleto
- curriculo adaptado sem vinculo claro com contexto de vaga/cargo quando esse dado existir
- template de curriculo inativo, inconsistente ou com problema operacional quando esse dado entrar no escopo da fase
- conta suspensa com relevancia operacional
- conta interna com papel invalido ou estado inconsistente

Cada pendencia deve continuar oferecendo:

- tipo
- entidade relacionada
- resumo curto
- prioridade
- CTA principal
- rota de destino

## Integracao com a home do admin

`/admin` continua sendo a central operacional principal, mas passa a exibir tambem:

- total de usuarios com onboarding incompleto
- total de perfis com baixa completude
- total de usuarios sem curriculo principal
- total de casos que exigem intervencao humana

## Backend e contratos

### Superficie atual

Hoje o backend tem contratos self-service para o proprio usuario autenticado, como:

- `GET/PUT /users/profile`
- `GET/POST/PUT/DELETE /resumes`

Isso nao basta para o caso administrativo, porque o admin precisa operar recursos de outros usuarios.
Tambem nao basta para o fluxo desejado de curriculo, porque o produto precisa lidar com upload de arquivo e parsing assistido antes da manutencao administrativa.

### Nova superficie administrativa

O backend deve ganhar contratos administrativos separados para:

- listar usuarios do produto
- obter detalhe administrativo de usuario
- atualizar dados administrativos do usuario
- alterar plano
- alterar status
- listar perfis em contexto administrativo
- obter perfil por contexto administrativo
- atualizar perfil em contexto administrativo
- listar curriculos em contexto administrativo
- obter curriculo por contexto administrativo
- atualizar curriculo em contexto administrativo
- definir ou corrigir qual curriculo e `master` em contexto administrativo
- expor estado de upload/parsing do curriculo para uso administrativo
- listar templates de curriculo
- criar e atualizar templates de curriculo otimizados
- ativar e desativar templates
- iniciar e encerrar impersonacao leve de inspecao

O `superadmin` deve ter ainda uma superficie para:

- listar equipe interna
- criar conta interna administrativa
- atualizar conta interna
- alterar papel administrativo
- suspender ou reativar acesso interno

## Modelo de autorizacao

O sistema precisa sair do modelo atual baseado apenas em usuario autenticado e ownership direto, para tambem suportar papel administrativo.

Minimo necessario:

- distinguir usuario comum de operadores internos
- diferenciar `admin` e `superadmin`
- aplicar autorizacao no backend, nao apenas na UI

## Dados e modelagem

O schema atual ja possui `User`, `UserProfile`, `Resume`, `AuthAccount` e `RefreshToken`.

Esta fase deve introduzir o necessario para suportar:

- papeis administrativos internos
- diferenciacao entre conta do produto e conta de staff quando necessario
- estados suficientes para manutencao de equipe interna
- origem do curriculo enviado, metadados de arquivo e estado de parsing quando ainda nao estiverem claros o suficiente
- diferenciacao estrutural entre `CV master` e curriculos adaptados
- vinculos futuros entre curriculos adaptados e vagas/cargos sem quebrar a modelagem central
- entidade separada para templates de curriculo otimizados
- relacao entre curriculo adaptado e template escolhido quando houver
- suporte futuro a operacoes de superadmin sem reestruturar tudo depois

## Seguranca e auditoria

Mesmo sem implementar auditoria profunda completa nesta fase, o design deve preservar espaco para:

- registro de acoes privilegiadas
- marcacao explicita de sessao assistida
- separacao clara entre suporte comum e intervencao sensivel

## Testes esperados

### Backend

- testes de autorizacao por papel
- testes de leitura e manutencao administrativa de usuarios
- testes de leitura e manutencao administrativa de perfis
- testes de leitura e manutencao administrativa de curriculos
- testes de distincao entre `CV master` e curriculos adaptados
- testes de criacao e manutencao de templates de curriculo por staff autorizado
- testes de criacao e manutencao de contas internas por `superadmin`
- testes do fluxo de impersonacao leve

### Web

- testes dos helpers de derivacao de pendencias e estados novos
- smoke tests ou testes direcionados para navegacao administrativa dos novos modulos
- testes de visibilidade correta entre `admin` e `superadmin`

## Fora de escopo desta fase

- criacao manual de usuarios comuns pelo admin
- `ghost mode` completo
- simulacao artificial de falhas de usuario
- absorver todas as configuracoes sensiveis do sistema de uma vez
- transformar a impersonacao leve em suporte invisivel ou irrestrito

## Resultado esperado

Ao fim desta fase, EarlyCV passa a ter:

- `admin` funcional para manutencao de usuarios do produto, perfis e curriculos
- `superadmin` separado institucionalmente, com area propria e gestao de staff interno
- pendencias de completude integradas ao admin existente
- uma primeira forma segura e explicita de inspecao assistida de conta
- base de curriculos preparada para um `CV master` por usuario e multiplos curriculos adaptados
- base institucional para templates de CV otimizados usados na adaptacao de curriculos
- base arquitetural correta para o futuro `ghost mode`
