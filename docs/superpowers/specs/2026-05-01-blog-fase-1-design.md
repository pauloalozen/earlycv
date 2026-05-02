# EarlyCV Blog Fase 1 Design

## Contexto

O EarlyCV precisa de uma base de blog com foco em SEO, performance e facilidade de publicacao.
Esta fase nao inclui CMS externo nem funcionalidades editoriais avancadas. O objetivo e criar uma fundacao estatica, limpa e escalavel para evolucoes futuras (hubs SEO, paginas transacionais e clusters por profissao).

## Objetivo da Fase 1

Entregar as rotas publicas `/blog` e `/blog/[slug]` com:

- listagem de posts publicados;
- pagina individual de artigo;
- SEO tecnico por pagina;
- schema.org para artigo e FAQ opcional;
- integracao de sitemap;
- CTA padrao para analise gratuita;
- tracking basico dos eventos de blog;
- estrutura simples para publicar novos posts em Markdown puro.

## Decisoes de Design

### Decisao 1: Conteudo local em Markdown puro

- Fonte de verdade: arquivos locais em `apps/web/src/content/blog/*.md`.
- Frontmatter obrigatorio para metadados de SEO e renderizacao.
- `status: "published"` controla visibilidade publica.
- `status: "draft"` fica excluido de listagem, rota estatica e sitemap.

Racional:

- Menor complexidade operacional na fase inicial.
- Excelente compatibilidade com build estatico e cache.
- Facil de manter por engenharia sem introduzir CMS agora.

### Decisao 2: Camada unica de conteudo em `lib/blog`

Criar um modulo coeso para leitura/parse/serializacao de posts, sem acoplar UI:

- `apps/web/src/lib/blog/types.ts`
- `apps/web/src/lib/blog/schema.ts`
- `apps/web/src/lib/blog/markdown.ts`
- `apps/web/src/lib/blog/posts.ts`

Responsabilidades:

- Ler arquivos markdown do diretorio de conteudo.
- Parsear frontmatter de forma tipada.
- Filtrar por status publicado.
- Resolver post por slug.
- Renderizar markdown para HTML no servidor.
- Calcular/expor campos derivados (tempo de leitura, datas formatadas, relacionados).

Racional:

- Mantem fronteira clara entre dominio de conteudo e camada de apresentacao.
- Facilita evolucao para novas rotas SEO sem refatorar parser.

### Decisao 3: SSG e cache por padrao

- `/blog` e `/blog/[slug]` serao renderizadas no App Router com pre-render estatico.
- `generateStaticParams` em `/blog/[slug]` usara apenas posts publicados.
- Evitar fetch dinamico remoto nesta fase.

Racional:

- Melhor performance e SEO crawlability.
- Simplifica invalidacao e reduz custo de runtime.

## Estrutura de Arquivos

### Novos arquivos de conteudo

- `apps/web/src/content/blog/como-adaptar-curriculo-para-vaga.md`
- `apps/web/src/content/blog/curriculo-ats.md`
- `apps/web/src/content/blog/palavras-chave-curriculo.md`
- `apps/web/src/content/blog/README.md`

### Novos arquivos de dominio/blog

- `apps/web/src/lib/blog/types.ts`
- `apps/web/src/lib/blog/schema.ts`
- `apps/web/src/lib/blog/markdown.ts`
- `apps/web/src/lib/blog/posts.ts`
- `apps/web/src/lib/blog/tracking.ts`

### Novos componentes (fora de `components/ui` por serem composicoes de feature)

- `apps/web/src/components/blog/blog-card.tsx`
- `apps/web/src/components/blog/blog-category-badge.tsx`
- `apps/web/src/components/blog/blog-analysis-cta.tsx`
- `apps/web/src/components/blog/blog-post-layout.tsx`
- `apps/web/src/components/blog/related-posts.tsx`
- `apps/web/src/components/blog/faq-block.tsx`

### Novas rotas

- `apps/web/src/app/blog/page.tsx`
- `apps/web/src/app/blog/[slug]/page.tsx`

### Arquivos existentes a alterar

- `apps/web/src/app/sitemap.ts`
- `apps/web/src/app/admin/eventos-e-logs/page.tsx`

## Modelo de Frontmatter

Campos obrigatorios:

- `title: string`
- `description: string`
- `slug: string`
- `publishedAt: YYYY-MM-DD`
- `updatedAt: YYYY-MM-DD`
- `category: string`
- `tags: string[]`
- `featured: boolean`
- `readingTime: string` (ex.: `6 min`)
- `status: "published" | "draft"`
- `seoTitle: string`
- `seoDescription: string`

Campos opcionais:

- `mainTag?: string`
- `coverImage?: string`
- `faq?: Array<{ question: string; answer: string }>`

## Comportamento Funcional

### `/blog`

- Exibir titulo e subtitulo definidos pelo produto.
- Listar somente posts `published`, ordenados por `publishedAt` desc.
- Renderizar bloco de destaque para primeiro `featured: true` (se houver).
- Exibir cards com titulo, descricao, categoria, data, leitura, slug e tag principal opcional.
- Exibir CTA padrao ao final com rota real de analise (`/adaptar`).
- Pagina indexavel com metadata completa.

### `/blog/[slug]`

- Resolver slug entre posts publicados.
- Slug inexistente retorna `notFound()` (404).
- Renderizar cabecalho editorial (titulo, descricao, data, categoria, leitura).
- Renderizar markdown em HTML server-side.
- Inserir CTA no topo (logo apos introducao) e no final.
- Se simples, exibir relacionados por categoria/tags (max 3).
- Se existir `faq` no post, renderizar bloco FAQ ao final.

## SEO e Metadados

### Metadata `/blog`

- `title`, `description`, `canonical`, OG e Twitter.
- `robots: index, follow`.

### Metadata `/blog/[slug]`

- `title`: `seoTitle` (fallback `title`).
- `description`: `seoDescription` (fallback `description`).
- `alternates.canonical`: URL absoluta do artigo.
- `openGraph`: `type: article`, `publishedTime`, `modifiedTime`, `authors: ["EarlyCV"]`.
- `twitter`: card summary_large_image seguindo padrao do projeto.
- `robots`: index/follow para publicados.

## Structured Data

### BlogPosting (sempre em artigo publicado)

Campos:

- `@type: BlogPosting`;
- `headline`;
- `description`;
- `datePublished`;
- `dateModified`;
- `author` (EarlyCV);
- `publisher` (EarlyCV);
- `mainEntityOfPage`;
- `image` (quando houver capa ou imagem padrao configurada).

### FAQPage (condicional)

Se frontmatter tiver `faq`, gerar JSON-LD `FAQPage` com `mainEntity`.

## Sitemap e Robots

### Sitemap

Atualizar `apps/web/src/app/sitemap.ts` para incluir:

- `/blog`;
- todos os posts publicados em `/blog/[slug]`.

Cada entrada de post tera:

- `url`;
- `lastModified` baseado em `updatedAt || publishedAt`;
- `changeFrequency: "weekly"`;
- `priority: 0.7`.

### Robots

- Preservar `apps/web/src/app/robots.ts` sem bloquear `/blog`.
- Nao alterar regras existentes de rotas internas.

## Tracking

Reaproveitar emissor existente `emitBusinessFunnelEvent` para evitar novo provider.

Eventos:

- `blog_index_viewed`
  - `page: "/blog"`
  - `source: "blog"`
- `blog_post_viewed`
  - `slug`, `title`, `category`, `tags`, `source: "blog"`
- `blog_cta_clicked`
  - `slug?`
  - `location: "top" | "middle" | "bottom" | "index"`
  - `target: "/adaptar"`
  - `source: "blog"`

Estrategia de implementacao:

- Disparos client-side em componentes pontuais do blog para evitar dependencia em page_view global.
- Guardar event helpers em `apps/web/src/lib/blog/tracking.ts` para padronizar payload.

## Admin: secao de eventos de blog

Atualizar `apps/web/src/app/admin/eventos-e-logs/page.tsx` para exibir secao dedicada:

- titulo "Eventos de Blog";
- lista dos 3 eventos implementados;
- acao de disparo sintetico reaproveitando mecanismo atual de emissao.

Objetivo:

- tornar observavel para operacao sem alterar fluxo principal de eventos.

## Conteudo Inicial

Publicar 3 artigos:

1. `como-adaptar-curriculo-para-vaga` (featured)
2. `curriculo-ats`
3. `palavras-chave-curriculo`

Diretrizes editoriais:

- linguagem pratica e honesta;
- sem promessas absolutas (entrevista, aprovacao, contratacao);
- sem estatisticas sem fonte;
- sem inventar experiencias/capacidades do usuario;
- incluir links internos cruzados entre os 3 artigos e CTA para `/adaptar`.

## Testes e Verificacao

Escopo minimo de verificacao antes de concluir:

- `npm run check --workspace @earlycv/web`
- `npm run test --workspace @earlycv/web`
- `npm run build --workspace @earlycv/web`

Validacoes funcionais:

- `/blog` lista apenas `published`;
- `/blog/[slug]` funciona para os 3 slugs iniciais;
- slug inexistente retorna 404;
- draft nao aparece em listagem/sitemap/rota estatica;
- metadata e canonical por artigo;
- JSON-LD `BlogPosting` (e `FAQPage` quando existir FAQ);
- sitemap inclui `/blog` + posts;
- CTA aponta para `/adaptar`;
- tracking dispara sem quebrar navegacao;
- layout responsivo em mobile.

## Riscos e Mitigacoes

- Risco: acoplamento indevido de tracking no SSR.
  - Mitigacao: eventos somente em client components isolados.
- Risco: inconsistencias de frontmatter por erro humano.
  - Mitigacao: validacao de schema no carregamento dos posts.
- Risco: crescimento desorganizado de conteudo.
  - Mitigacao: `README.md` com padrao editorial e tecnico.

## Fora de Escopo (Fase 1)

- CMS externo;
- comentarios;
- newsletter;
- busca interna complexa;
- paginas programaticas por profissao;
- paginas transacionais SEO fora de `/blog`;
- area administrativa de posts.

## Preparacao para Fase 2

A base fica pronta para evoluir com baixo atrito para:

- clusters transacionais (`/curriculo-ats`, `/palavras-chave-curriculo`, etc.);
- hubs por tema/categoria;
- templates de pagina por profissao (`/curriculo-para/[profissao]`);
- possivel migracao para MDX/CMS mantendo contrato de `lib/blog`.
