# Meu Perfil + Meu CV Master Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar a experiência em duas telas: `/meu-perfil` como roteador inicial pós-login e `/meu-cv-master` como área de edição e gestão do CV Master baseado no `UserProfile`.

**Architecture:** `/meu-perfil` vira uma tela de orientação, status e atalhos, sem formulários nem upload. `/meu-cv-master` concentra toda a edição do perfil e do CV Master, incluindo estados de revisão e edição inline por bloco. `/dashboard` continua apenas como redirect para `/meu-perfil`.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS v4, server/client components no `apps/web`, APIs já existentes de `profiles` e `resumes`.

---

### 1. Estrutura de produto

O fluxo passa a ter três camadas claras:

- `/dashboard` -> redirect técnico para `/meu-perfil`
- `/meu-perfil` -> roteador inicial pós-login
- `/meu-cv-master` -> edição do CV Master e dos dados do `UserProfile`

O objetivo é evitar uma tela sobrecarregada. O usuário primeiro vê contexto, status e próximos passos. Só entra na edição quando clica no status do perfil.

---

### 2. Tela `/meu-perfil`

Essa tela substitui a função do dashboard atual, mas não permite edição.

Conteúdo, de cima para baixo:

- saudação: `Olá, [nome]`
- créditos disponíveis com link para `Comprar créditos`
- bloco de status do perfil com porcentagem de completude e número de sugestões da IA
- ação principal `Adaptar CV`
- cards de métricas: vagas analisadas, melhoria recente, score médio
- cards de candidaturas recentes
- zona de perigo: excluir conta

Regras:

- o bloco de status do perfil deve ser clicável e levar para `/meu-cv-master`
- ao clicar em uma sugestão, a tela deve abrir já focada no bloco que tem lacuna
- `Comprar créditos` leva para planos
- `Adaptar CV` leva para o fluxo de análise existente
- não existe formulário nessa tela
- não existe upload nessa tela

Essa tela mantém a linguagem visual do produto e a composição geral da referência, mas funciona como hub de navegação e decisão.

---

### 3. Tela `/meu-cv-master`

Essa é a tela de edição. Aqui ficam:

- mapeamento dos campos do `UserProfile`
- upload, troca e remoção do CV Master
- revisão das informações extraídas pela IA
- edição manual por bloco

Campos disponíveis hoje:

- nome
- email
- telefone
- LinkedIn
- localização
- resumo profissional
- formação
- experiência
- habilidades e competências
- certificações e cursos
- link extra como GitHub ou site próprio

Preparação para o portal de vagas:

- a arquitetura visual e de dados deve aceitar novos campos sem refatoração grande
- a tela não deve assumir que o conjunto atual é o final

---

### 4. Estados de edição dos blocos

Os blocos editáveis não se comportam como formulário tradicional. Eles operam em três estados:

#### 4.1 Revisão

Estado padrão ao abrir a tela.

- todos os blocos colapsados
- cada bloco mostra se a extração está completa ou se há lacunas
- a interface incentiva conferência rápida, não preenchimento do zero

#### 4.2 Edição inline

- apenas o bloco tocado expande
- os demais continuam fechados
- a edição é sempre escopada ao bloco ativo
- não existe modo global com a página inteira aberta

#### 4.3 Lacunas sugeridas

- a IA sinaliza o que falta ou pode melhorar
- os blocos com lacuna aparecem mais evidentes na revisão
- o acesso por sugestão leva direto ao bloco relevante

Princípio central: o perfil não é um formulário vazio. É o CV Master em modo editável, sempre partindo de conteúdo já extraído do PDF.

---

### 5. Comportamento do CV Master

A tela `/meu-cv-master` é responsável por:

- mostrar se existe CV Master ativo
- mostrar nome do arquivo/título e data de atualização
- permitir cadastrar, substituir e remover
- indicar sincronização com o perfil

O fluxo de upload continua usando as regras já existentes de proteção e processamento. A UI só organiza e orienta.

---

### 6. Onboarding

No primeiro acesso:

- o usuário envia o PDF do CV
- a IA processa o conteúdo
- o usuário cai direto em `/meu-cv-master` no estado de revisão
- o usuário confirma ou corrige
- depois segue para a primeira adaptação

Isso faz a primeira experiência já ensinar o padrão de uso da tela de edição.

---

### 7. Menu

No menu global:

- `Dashboard` passa a ser `Meu Perfil`
- `Meu CV Master` não entra no menu
- acesso à edição ocorre somente pelo status clicável em `/meu-perfil`
- demais itens permanecem como estão

---

### 8. SEO e indexação

- `/meu-perfil` e `/meu-cv-master` são rotas autenticadas e devem usar `noindex`
- `/dashboard` como redirect não precisa ser indexável

---

### 9. Critérios de sucesso

- `/dashboard` redireciona para `/meu-perfil`
- `/meu-perfil` funciona só como roteador e status hub
- `/meu-cv-master` concentra toda a edição do perfil e do CV Master
- o usuário entra na edição por status, não pelo menu
- a UI segue a referência de composição, mas com a linguagem visual do produto
- a tela já fica pronta para expansão futura do portal de vagas

---

### 10. Riscos e decisões

- Não duplicar estado entre `UserProfile` e outras tabelas sem necessidade
- Não inventar campos que não existam no schema atual
- Não quebrar o fluxo de `/adaptar`
- Não transformar `/meu-cv-master` em formulário gigante de página única
- Manter o design modular para receber novos campos futuramente
