# SEO — páginas perenes do Radar (área, empresa, tecnologia, remotas, nível, estágio, cidade)

Status: Fases 1 e 2 implementadas (branch `feature/seo-paginas-perenes-radar`, a partir de `main`), não mergeadas. Fase 3 (medição) começa após o deploy.

## Implementação (06/10/2026)
- API: `RadarLandingsService` + `GET /internal/jobs/landings/index` e `/landings/summary` (contagens no banco, nunca lista de vagas em memória).
- Web: `lib/radar-landings.ts` (definições, títulos, textos, elegibilidade, links) e `app/radar/_landing/radar-landing-page.tsx` (metadata, panorama, FAQ, "Explore mais vagas", BreadcrumbList).
- Rotas novas: `/radar/estagio`, `/radar/estagio/remoto`, `/radar/area/[area]/remoto`, `/radar/area/[area]/junior`, `/radar/cidade/[cidade]`; as 6 antigas passaram a usar o componente.
- Sitemap com as landings elegíveis; hub de links em `/radar`; vaga linka área, área+remoto, empresa, cidade, remotas e até 2 tecnologias (só landings com volume).
- Filtros: opções dos dropdowns só entram no DOM com o dropdown aberto.
- Mínimo para indexar: 5 vagas (tecnologia: 10). Recorte sem vaga → 404 (empresa, cidade, tecnologia, combinações).
Origem: análise da queda de impressões no Google (06/10/2026).

## Diagnóstico (06/10/2026)

As landings do Radar existem desde o Sprint 8 (12/08): `/radar/area/[area]`,
`/radar/empresa/[empresa]`, `/radar/tecnologia/[tech]`, `/radar/remotas`,
`/radar/junior`, `/radar/senior`. No Search Console elas praticamente não têm
impressão (área 14→12, landings 0→10, empresa 280→68 em 14 dias). Toda a
visibilidade vem de páginas de vaga, que são efêmeras (morrem quando a vaga
fecha) e duplicam o conteúdo do ATS de origem.

Por que as landings não ranqueiam:

| Problema | Evidência |
|---|---|
| Fora do sitemap | sitemap.xml (5.672 URLs) não tem nenhuma landing do radar |
| Conteúdo próprio nulo | uma frase genérica igual em todas |
| HTML dominado por ruído de filtro | ~1 MB / ~4.300 palavras, quase tudo opção de filtro, inclusive lixo ("Armazem 9", "Huila", "Remote; Germany") |
| Títulos desalinhados da busca | "Vagas remotas de tecnologia no Brasil" vs busca "vagas remotas"; "Vagas na Itaú"; sem contagem/frescor |
| Paginação canonicaliza para a página 1 | `?page=2` → canonical `/radar/remotas`; Google só vê 20 vagas por landing |
| Combinações com demanda não existem | sem estágio, área+remoto, área+nível, cidade |

Buscas genéricas já observadas no GSC (impressões em 28 dias): "vagas remotas" (140),
"estágio ti home office", "estagio ti remoto", "estagio em ti remoto",
"vagas python remoto", "vagas desenvolvedor remoto",
"vagas segurança da informação junior", "vaga analista de dados", "vagas ti",
"vagas ti volta redonda", "vagas remotas rj".

## Plano

### Fase 1 — consertar as landings existentes
1. Sitemap com as landings que têm volume mínimo de vagas; abaixo do mínimo, `noindex` (evita página vazia indexada).
2. Title/description alinhados à busca + contagem viva ("Vagas remotas: 1.538 vagas home office abertas hoje"); corrigir gramática de empresa ("Vagas no Itaú"/"Vagas na Stefanini" → formato neutro "Vagas Itaú").
3. Bloco de texto próprio gerado de dados, server-rendered: total de vagas, empresas que mais contratam, tecnologias mais pedidas, divisão remoto/híbrido/presencial, data de atualização.
4. Reduzir ruído de filtros no HTML inicial (top opções; descartar localizações inválidas). Comportamento do filtro para o usuário não muda.
5. Paginação com canonical auto-referente.
6. Linkagem interna: hub "Vagas por área / tecnologia / modalidade / nível / cidade" em `/radar` e nas landings; vaga linka também tecnologia e nível.
7. JSON-LD `ItemList` + `BreadcrumbList` nas landings.

### Fase 2 — combinações com demanda real (só com volume mínimo)
- `/radar/estagio`, `/radar/estagio/remoto`
- `/radar/area/{area}/remoto`, `/radar/area/{area}/junior`
- `/radar/cidade/{cidade}` (top cidades por volume)

### Fase 3 — medir e iterar
- GSC filtrado por essas URLs a cada 2 semanas; ajustar títulos/textos pelas queries; expandir só o que performar.

## Guardrails
- Experiência do usuário logado e filtros não mudam.
- Conteúdo vem de dados reais — nada de texto gerado por IA em massa.
- Página com volume abaixo do mínimo nunca fica indexável.
- Sem carregar listas inteiras em memória (ver regra de paginação no banco).
