<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# EarlyCV

- EarlyCV e uma plataforma para descobrir vagas antes da maioria, avaliar aderencia e adaptar curriculos para cada candidatura.
- Stack principal: Next.js App Router, TypeScript, Tailwind CSS v4, Biome.
- Preserve a linguagem visual do produto: fundo claro, acento laranja/terracota, tipografia limpa e navegacao suave.
- Componentes genericos reutilizaveis ficam em `src/components/ui`; siga tambem `src/components/ui/AGENTS.md`.
- SEO e requisito de produto: toda rota publica deve sair com metadata completa, canonical, OG/Twitter, robots e structured data quando fizer sentido.
- Vagas publicas devem ter URL dedicada, conteudo renderizado no servidor e `JobPosting` estruturado.
- Rotas internas, utilitarias ou de showcase normalmente devem usar `noindex`.
