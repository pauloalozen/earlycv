# Blog content guide

Use arquivos Markdown (`.md`) em `apps/web/src/content/blog` para publicar posts.

## Frontmatter obrigatorio

- `title`
- `description`
- `slug`
- `publishedAt` (YYYY-MM-DD)
- `updatedAt` (YYYY-MM-DD)
- `category`
- `tags` (array de strings)
- `featured` (boolean)
- `readingTime` (ex.: `6 min`)
- `status` (`published` ou `draft`)
- `seoTitle`
- `seoDescription`

Campos opcionais:

- `mainTag`
- `coverImage`
- `faq` (array com `question` e `answer`)

## Publicacao e destaque

- `status: published` entra em `/blog`, `/blog/[slug]` e sitemap.
- `status: draft` fica fora de listagem publica e rotas estaticas.
- `featured: true` habilita destaque no topo de `/blog` (primeiro match por data).

## SEO

- Prefira titulos e descricoes objetivas, sem clickbait.
- Garanta que `seoTitle` e `seoDescription` reflitam o conteudo real.
- Inclua links internos para outros artigos relevantes e CTA para `/adaptar` quando fizer sentido.

## Cautelas legais e comerciais

- Nao prometer entrevista, contratacao ou resultados garantidos.
- Nao inventar fatos de carreira, certificacoes, cargos ou tecnologias.
- Evitar estatisticas sem fonte verificavel.
