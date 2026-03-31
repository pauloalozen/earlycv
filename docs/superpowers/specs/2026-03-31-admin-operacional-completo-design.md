# Admin Operacional Completo Design

**Data:** 2026-03-31

## Objetivo

Criar um admin funcional e centralizado para operacao interna da EarlyCV, concentrando cadastros, continuidade de fluxos interrompidos e tarefas operacionais do produto em uma unica experiencia. O admin deve permitir que a equipe interna consiga ver o que existe, o que falta concluir e qual a proxima acao recomendada em cada entidade.

## Escopo do Admin v1

O admin v1 cobre toda a estrutura do backoffice, mas prioriza funcionalidades completas nas areas de operacao de captura de vagas e continuidade de cadastro. Os modulos de usuarios, perfis e curriculos entram com visibilidade operacional e status de completude, mesmo que nem todos os fluxos de edicao avancada sejam implementados no primeiro incremento.

Modulos previstos:

- Visao geral
- Empresas
- Fontes de vagas
- Runs de ingestao
- Vagas
- Pendencias
- Usuarios
- Perfis
- Curriculos
- Configuracoes

## Principio do Produto

O admin segue o modelo orientado a operacao. Isso significa que ele nao e apenas um conjunto de telas CRUD. Cada tela deve responder tres perguntas:

- o que existe agora
- o que esta incompleto ou com problema
- qual a proxima acao recomendada

Esse principio evita que cadastros fiquem perdidos pela metade e reduz dependencia de ferramentas externas como Insomnia para tarefas administrativas do dia a dia.

## Navegacao Principal

O admin ganha uma shell propria, separada da navegacao publica do produto, com:

- sidebar fixa com os modulos
- header com titulo, contexto da pagina e acoes principais
- area central com cards, tabelas, filtros e formularios
- rotas internas sempre com `robots: { index: false, follow: false }`

Estrutura de rotas prevista:

- `/admin`
- `/admin/empresas`
- `/admin/empresas/[id]`
- `/admin/fontes`
- `/admin/fontes/nova`
- `/admin/fontes/[id]`
- `/admin/runs`
- `/admin/runs/[id]`
- `/admin/vagas`
- `/admin/pendencias`
- `/admin/usuarios`
- `/admin/perfis`
- `/admin/curriculos`
- `/admin/configuracoes`

## Shell do Admin

O admin deve ter uma identidade visual de backoffice, mas ainda coerente com a linguagem da EarlyCV: superfices claras, acento terracota/laranja, tipografia limpa e foco em legibilidade operacional. O layout nao deve parecer uma area improvisada; precisa comunicar controle, estado e continuidade.

Elementos recorrentes da shell:

- sidebar com modulos e badges de contagem quando fizer sentido
- area de contexto com breadcrumb ou subtitulo curto
- barra de acao com CTA principal por tela
- cards de resumo com estados operacionais
- listas e tabelas com badges semanticos

## Modulos e Responsabilidades

### 1. Visao Geral

E a central operacional do admin. Nao serve apenas como dashboard visual.

Responsabilidades:

- mostrar pendencias abertas por tipo
- destacar empresas sem `job source`
- destacar fontes sem primeiro run
- destacar runs com falha recente
- mostrar vagas recentemente ingeridas
- mostrar sinais de pendencias em usuarios, perfis e curriculos
- oferecer atalhos para “continuar cadastro”, “rodar agora” e “revisar erro”

### 2. Empresas

Responsabilidades:

- listar empresas
- criar empresa
- ver detalhe da empresa
- editar empresa
- exibir status operacional da empresa
- continuar cadastro quando faltar `job source`

Estados operacionais iniciais:

- completa
- incompleta
- aguardando primeiro run
- com falha recente

### 3. Fontes de Vagas

Responsabilidades:

- listar `job_sources`
- criar fonte isoladamente
- criar fonte a partir de empresa existente
- editar dados da fonte
- ver ultimo run e historico recente
- disparar ingestao manual
- ativar ou desativar fonte

### 4. Runs de Ingestao

Responsabilidades:

- listar runs globalmente
- filtrar por status, empresa ou fonte
- abrir detalhe do run
- revisar preview dos itens ingeridos
- destacar falhas e contadores

### 5. Vagas

Responsabilidades:

- listar vagas ingeridas
- mostrar empresa, fonte, status e datas principais
- permitir navegacao de auditoria da vaga para a fonte e o run relacionado quando aplicavel

### 6. Pendencias

E o modulo transversal mais importante do caminho escolhido.

Responsabilidades:

- consolidar o que falta concluir em todo o sistema
- permitir filtrar por tipo e prioridade
- levar direto para a acao que resolve o problema

Tipos iniciais de pendencia:

- empresa sem `job source`
- `job source` sem primeiro run
- `job source` com falha recente
- run com falha
- usuario sem perfil
- perfil incompleto
- usuario sem curriculo principal

Cada pendencia deve ter:

- tipo
- entidade relacionada
- resumo curto
- prioridade
- CTA principal
- rota de destino

### 7. Usuarios

Responsabilidades:

- listar contas criadas
- exibir status de acesso e atividade basica
- mostrar relacao com perfil e curriculo

### 8. Perfis

Responsabilidades:

- listar perfis
- mostrar nivel de completude
- destacar campos principais preenchidos ou ausentes

### 9. Curriculos

Responsabilidades:

- listar curriculos
- mostrar curriculo principal por usuario
- mostrar status e vinculacao basica

### 10. Configuracoes

Responsabilidades:

- concentrar ajustes administrativos que nao pertencem a uma entidade operacional especifica
- entrar inicialmente como modulo base, sem tentar absorver configuracoes complexas neste primeiro ciclo

## Fluxo de Continuidade

O admin deve ser capaz de retomar fluxos interrompidos automaticamente.

Exemplo principal:

1. admin cria empresa
2. admin nao cria `job source`
3. a empresa aparece como `incompleta`
4. a empresa entra na fila de `Pendencias`
5. o detalhe da empresa mostra CTA `Criar primeira fonte`
6. apos criar a fonte, a empresa muda para `aguardando primeiro run`
7. apos o primeiro run bem-sucedido, sai do fluxo de onboarding operacional

Fluxos equivalentes devem existir para outras entidades conforme o modulo evoluir.

## Motor de Pendencias

Sempre que possivel, o sistema deve derivar pendencias a partir do estado real ja existente no backend, evitando persistir um sistema paralelo de status sem necessidade.

Preferencias:

- usar estado calculado primeiro
- persistir estado apenas quando auditoria, performance ou clareza operacional realmente exigirem

Exemplos de derivacao:

- empresa sem `job_source` = empresa existente + zero fontes relacionadas
- fonte sem primeiro run = `job_source` existente + zero `ingestionRuns`
- falha recente = ultimo run ou metadado de erro recente na fonte
- usuario sem curriculo principal = usuario existente + zero curriculos principais

## Dados e Interfaces

O admin deve reutilizar o backend ja existente sempre que possivel. Quando o contrato atual nao trouxer o suficiente para a experiencia operacional, a API pode ganhar respostas enriquecidas ou endpoints agregadores de leitura para o admin.

Exemplos de leitura enriquecida:

- empresa com contadores e estado de completude
- `job_source` com ultimo run resumido
- visao agregada de pendencias
- visao consolidada da home do admin

## Erros e Recuperacao

O admin nao deve quebrar em branco quando a API falhar. Cada modulo precisa ter estados de erro acionaveis, com mensagem clara e CTA para recuperacao.

Exemplos:

- token invalido ou expirado
- API indisponivel
- falha ao continuar cadastro
- conflito de dados no backend

Em vez de uma tela vazia, o admin deve mostrar:

- o que falhou
- qual entidade foi afetada
- o que o operador pode fazer agora

## SEO e Exposicao

Todo o admin deve ser explicitamente tratado como interno:

- `noindex`
- `nofollow`
- sem intencao de descoberta publica

## Fases de Implementacao

### Fase 1

- shell do admin
- visao geral
- empresas
- fontes de vagas
- runs
- pendencias operacionais de captura
- fluxo completo de continuidade `empresa -> fonte -> primeiro run`

### Fase 2

- vagas
- filtros globais e busca operacional
- refinamento dos estados operacionais de captura

### Fase 3

- usuarios
- perfis
- curriculos
- pendencias de conta e perfil

### Fase 4

- configuracoes
- refinamentos de auditoria
- permissoes e roles, se necessario

## Resultado Esperado

Ao final desse desenho, a EarlyCV passa a ter um admin que:

- centraliza operacao interna
- reduz dependencia de ferramentas tecnicas para tarefas administrativas
- permite continuar fluxos incompletos sem perder contexto
- ajuda a equipe a priorizar a proxima acao
- prepara uma base solida para o futuro admin de produto e para a futura ingestao assíncrona
