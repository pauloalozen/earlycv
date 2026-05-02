# TASK A FAZER - ORDEM DE PRIORIDADE.

1. Colocar a rota /pagamentos dentro do padrão do site, com exibição do header e logo acima como em recuperar senha
2. Personalizar o erro 404 para padrão do site
3. Suspense no header da landing para não mudar status quando carrega.

4. Ao fazer a compra pelo seu já usar 1 crédito para liberar o cv.
5. Ao liberar o CV, teve que atualizar a tela para diminuir o crédito, tem que atualizar automático.
6. Criar rota para entrar e outra para criar-conta, a mesma rota ta gerando confusão.

7. Ajustar COPY onde aparecer o termo ATS.
8. Layout do score ats no resultado quebrado.
9. criar um suspense no loanding da tela result no card abaixo do ats score (esta mudando estado na tela)
10. Trocar o botão "COmprar Cŕeditos" quando logado no cta do resultado (mudar para Liberar meu CV agora.)

# Novas Features:

1. Log de exclusão de conta, saber quem exclui e pq?

========================================================

# Criação BLOG

========================================================

# FASE 2

Vamos implementar a Fase 2 do SEO do EarlyCV: páginas transacionais indexáveis.

Contexto:
A Fase 1 do blog já foi implementada e validada:

- /blog
- /blog/[slug]
- Markdown local
- SEO metadata
- JSON-LD BlogPosting/FAQPage
- sitemap com posts publicados
- CTA BlogAnalysisCTA
- tracking de blog
- build do @earlycv/web passando

O objetivo agora é criar páginas SEO transacionais fora do /blog, mais próximas da conversão.

Essas páginas devem capturar buscas com intenção comercial/informacional forte e levar o usuário para o fluxo de análise gratuita do EarlyCV.

Rotas da Fase 2:

- /curriculo-ats
- /adaptar-curriculo-para-vaga
- /curriculo-gupy
- /modelo-curriculo-ats

Importante:

- Não criar CMS.
- Não criar páginas por profissão ainda.
- Não criar hub de 500 palavras-chave ainda.
- Não criar ferramenta extratora de keywords ainda.
- Não mexer no fluxo de pagamento.
- Não mexer no dashboard.
- Não alterar a landing principal, exceto se for necessário adicionar links discretos no footer/menu.
- Não prometer contratação, entrevista, aprovação ou “passar em qualquer ATS”.
- Não inventar estatísticas.
- Não copiar conteúdo de concorrentes.
- Manter identidade visual atual do EarlyCV.
- Reaproveitar componentes existentes quando fizer sentido.
- Reaproveitar BlogAnalysisCTA ou criar um SEOAnalysisCTA genérico se o nome “Blog” não fizer sentido fora do blog.

Objetivo técnico:
Criar uma base reutilizável para páginas SEO transacionais, com:

1. layout consistente;
2. metadata dinâmica ou estática por página;
3. JSON-LD WebPage;
4. FAQPage quando houver FAQ;
5. BreadcrumbList;
6. sitemap;
7. tracking;
8. CTA forte para análise gratuita;
9. links internos para blog e outras páginas SEO.

==================================================

1. # Arquitetura recomendada

Criar estrutura simples para dados de páginas SEO, por exemplo:

apps/web/src/lib/seo-pages/

Arquivos possíveis:

- types.ts
- pages.ts
- schema.ts, se necessário
- tracking.ts, se necessário

Cada página SEO pode ser definida por objeto tipado contendo:

- slug
- path
- title
- description
- seoTitle
- seoDescription
- heroTitle
- heroDescription
- category
- sections
- faq
- relatedLinks
- cta
- updatedAt

Exemplo conceitual:

{
slug: "curriculo-ats",
path: "/curriculo-ats",
seoTitle: "Currículo ATS: como criar um currículo compatível | EarlyCV",
seoDescription: "Entenda como criar um currículo compatível com ATS, evitar erros de formatação e melhorar a aderência com vagas.",
heroTitle: "Currículo ATS: crie um currículo que sistemas conseguem ler",
heroDescription: "Entenda como sistemas de triagem analisam currículos e veja como melhorar a compatibilidade do seu CV com cada vaga.",
faq: [...]
}

A implementação pode ser feita com páginas estáticas individuais ou uma camada compartilhada. Escolha o caminho mais simples e limpo para o padrão atual do projeto.

================================================== 2. Componentes reutilizáveis
==================================================

Criar ou reaproveitar componentes para páginas SEO:

- SeoPageLayout
- SeoHero
- SeoSection
- SeoFAQ
- SeoInternalLinks
- SeoAnalysisCTA

Se já existir componente equivalente no blog, reaproveitar sem duplicar desnecessariamente.

O CTA deve ter:

Título:
"Descubra se seu currículo combina com a vaga"

Texto:
"Cole a descrição da vaga, envie seu currículo e receba uma análise gratuita de compatibilidade em poucos minutos."

Botão:
"Analisar meu currículo grátis"

Rota:
Usar a rota atual do fluxo de análise do EarlyCV. Pelo que foi usado na Fase 1, o target atual é "/adaptar". Confirmar no código existente antes de usar.

================================================== 3. Tracking
==================================================

Adicionar tracking específico para páginas SEO transacionais.

Eventos:

seo_page_viewed
Propriedades:

- slug
- path
- page_type="transactional_seo"
- source="seo_page"

seo_page_cta_clicked
Propriedades:

- slug
- path
- location="hero" | "middle" | "bottom"
- target="/adaptar" ou rota real
- source="seo_page"

Se houver tracking global de page_view, não duplicar como page_view. Estes eventos são específicos de funil SEO.

Criar trackers client separados, sem importar conteúdo pesado no client.

================================================== 4. SEO técnico
==================================================

Para cada página:

- title;
- description;
- canonical;
- Open Graph;
- robots index/follow;
- JSON-LD WebPage;
- JSON-LD BreadcrumbList;
- FAQPage condicional quando houver FAQ.

Adicionar ao sitemap:

- /curriculo-ats
- /adaptar-curriculo-para-vaga
- /curriculo-gupy
- /modelo-curriculo-ats

Garantir que robots não bloqueia essas páginas.

================================================== 5. Página /curriculo-ats
==================================================

Objetivo:
Capturar buscas sobre currículo ATS.

SEO title:
"Currículo ATS: como criar um currículo compatível | EarlyCV"

SEO description:
"Entenda como criar um currículo compatível com ATS, evitar erros de formatação e melhorar a aderência do seu CV com cada vaga."

Hero title:
"Currículo ATS: crie um currículo que sistemas conseguem ler"

Hero description:
"Entenda como sistemas de triagem analisam currículos e veja como melhorar a compatibilidade do seu CV com cada vaga."

Seções obrigatórias:

1. O que é um currículo ATS
   Explicar que ATS são sistemas usados para organizar, filtrar ou apoiar processos seletivos. Evitar afirmar funcionamento interno específico de qualquer plataforma.

2. Por que a formatação importa
   Explicar problemas com excesso de colunas, imagens, tabelas complexas, ícones e layouts muito visuais.

3. O que melhora a leitura do currículo
   Lista:

- estrutura simples;
- títulos claros;
- experiências com cargo, empresa, período e resultados;
- competências relevantes;
- palavras-chave compatíveis com a vaga;
- arquivo em formato adequado.

4. Erros comuns

- currículo só em imagem;
- design complexo;
- palavras-chave soltas sem contexto;
- resumo genérico;
- experiências sem resultado;
- falta de aderência à vaga.

5. Como o EarlyCV ajuda
   Explicar:

- compara currículo com vaga;
- mostra score de compatibilidade;
- identifica lacunas;
- sugere melhorias;
- gera versão otimizada mediante liberação.

FAQ:

- O que significa ATS?
- Currículo em PDF passa em ATS?
- Currículo feito no Canva pode prejudicar?
- Palavras-chave garantem aprovação?
- Preciso adaptar o currículo para cada vaga?

================================================== 6. Página /adaptar-curriculo-para-vaga
==================================================

Objetivo:
Capturar busca de alta intenção comercial.

SEO title:
"Adaptar currículo para vaga: como melhorar sua aderência | EarlyCV"

SEO description:
"Compare seu currículo com a descrição da vaga, encontre lacunas e gere uma versão mais alinhada ao que a empresa procura."

Hero title:
"Adapte seu currículo para cada vaga sem inventar experiência"

Hero description:
"Compare seu currículo com a descrição da vaga, identifique lacunas e gere uma versão mais alinhada ao que a empresa procura."

Seções obrigatórias:

1. Por que adaptar o currículo para cada vaga
   Explicar que vagas parecidas podem priorizar competências diferentes.

2. O que deve mudar no currículo

- resumo profissional;
- ordem e destaque das experiências;
- competências;
- palavras-chave;
- projetos;
- resultados mais relevantes.

3. O que não deve ser inventado
   Deixar claro que adaptação não é mentir. É reorganizar e destacar experiências reais.

4. Como usar a descrição da vaga
   Explicar:

- identificar responsabilidades;
- separar requisitos obrigatórios e desejáveis;
- observar ferramentas e metodologias;
- usar palavras-chave com contexto.

5. Exemplo simples antes/depois
   Criar exemplo textual curto:
   Antes:
   "Responsável por relatórios e indicadores."
   Depois:
   "Desenvolveu dashboards em Power BI para acompanhamento de indicadores comerciais, apoiando decisões de vendas e priorização de oportunidades."

6. Como o EarlyCV ajuda

- analisa currículo + vaga;
- calcula compatibilidade;
- mostra palavras importantes;
- aponta lacunas;
- gera currículo adaptado.

FAQ:

- Posso adaptar o mesmo currículo para várias vagas?
- Adaptar currículo é mentir?
- O que muda entre uma versão e outra?
- Preciso mudar o currículo inteiro?
- Como saber quais palavras-chave usar?

================================================== 7. Página /curriculo-gupy
==================================================

Objetivo:
Capturar buscas brasileiras sobre Gupy e plataformas de recrutamento.

SEO title:
"Currículo para Gupy: como melhorar sua aderência à vaga | EarlyCV"

SEO description:
"Veja como estruturar seu currículo, usar palavras-chave e evitar erros que podem prejudicar sua candidatura em plataformas como a Gupy."

Hero title:
"Currículo para Gupy: como aumentar a aderência com a vaga"

Hero description:
"Veja como estruturar seu currículo, usar palavras-chave e evitar erros que prejudicam a clareza da sua candidatura em plataformas de recrutamento."

Cuidados obrigatórios:

- Não afirmar funcionamento interno exato da Gupy.
- Não dizer que a Gupy dá uma nota específica ao currículo.
- Não dizer que existe fórmula garantida para passar.
- Usar termos seguros como:
  "plataformas como a Gupy podem usar informações estruturadas, dados preenchidos e aderência textual para apoiar recrutadores e empresas."

Seções obrigatórias:

1. Por que seu currículo pode não avançar
   Explicar possibilidades:

- alta concorrência;
- vaga com muitos candidatos;
- currículo genérico;
- baixa aderência textual;
- experiências pouco claras;
- falta de requisitos importantes.

2. O que normalmente ajuda

- clareza;
- palavras-chave relevantes;
- experiências conectadas à vaga;
- resultados;
- estrutura simples;
- dados completos.

3. Como adaptar currículo antes de se candidatar

- ler a vaga;
- mapear requisitos;
- revisar resumo;
- ajustar competências;
- destacar experiências relacionadas;
- evitar exageros.

4. Erros comuns

- copiar a vaga inteira;
- colocar termos que não domina;
- usar currículo visual demais;
- enviar sempre o mesmo CV;
- deixar experiências vagas.

5. Como o EarlyCV ajuda

- compara CV com a vaga antes da candidatura;
- mostra lacunas;
- sugere melhorias;
- ajuda a gerar uma versão adaptada.

FAQ:

- A Gupy reprova currículo automaticamente?
- Existe currículo perfeito para Gupy?
- Devo fazer um currículo diferente para cada vaga?
- Posso usar currículo em PDF?
- O que mais pesa em uma candidatura?

================================================== 8. Página /modelo-curriculo-ats
==================================================

Objetivo:
Capturar busca por modelo de currículo compatível com ATS.

SEO title:
"Modelo de currículo ATS simples e fácil de ler | EarlyCV"

SEO description:
"Veja uma estrutura simples de currículo ATS, com seções claras para resumo, experiência, competências, formação e projetos."

Hero title:
"Modelo de currículo ATS simples, limpo e fácil de ler"

Hero description:
"Veja uma estrutura recomendada para criar um currículo objetivo, compatível com triagens automatizadas e fácil para recrutadores analisarem."

Seções obrigatórias:

1. Estrutura recomendada
   Mostrar ordem:

- dados de contato;
- resumo profissional;
- experiências;
- competências;
- formação;
- certificações;
- projetos, se fizer sentido.

2. Cabeçalho
   Explicar o que incluir e o que evitar.

3. Resumo profissional
   Exemplo simples.

4. Experiência profissional
   Mostrar estrutura:
   Cargo | Empresa | Período
   Bullets com ação + contexto + resultado.

5. Competências
   Separar por grupos:

- técnicas;
- ferramentas;
- metodologias;
- idiomas;
- comportamentais, se relevantes.

6. O que evitar

- foto, salvo quando fizer sentido;
- excesso de ícones;
- gráficos;
- tabelas complexas;
- colunas difíceis de ler;
- informações pessoais desnecessárias.

7. Exemplo de modelo em texto
   Criar um modelo simples, não muito longo.

8. Como adaptar o modelo à vaga
   Conectar ao EarlyCV.

FAQ:

- Qual melhor formato para currículo ATS?
- Currículo ATS precisa ser feio?
- Posso usar duas colunas?
- Devo colocar foto?
- Posso baixar um modelo pronto?

================================================== 9. Links internos
==================================================

Adicionar links entre páginas:

- /curriculo-ats deve linkar para:
  - /modelo-curriculo-ats
  - /adaptar-curriculo-para-vaga
  - /blog/palavras-chave-curriculo

- /adaptar-curriculo-para-vaga deve linkar para:
  - /curriculo-ats
  - /curriculo-gupy
  - /blog/como-adaptar-curriculo-para-vaga

- /curriculo-gupy deve linkar para:
  - /adaptar-curriculo-para-vaga
  - /curriculo-ats
  - /blog/curriculo-ats

- /modelo-curriculo-ats deve linkar para:
  - /curriculo-ats
  - /adaptar-curriculo-para-vaga
  - /blog/palavras-chave-curriculo

Se algum link de blog não existir ou tiver slug diferente, ajustar para o slug real.

================================================== 10. Menu/footer
==================================================

Se existir footer com links institucionais, adicionar discretamente:

- Blog
- Currículo ATS
- Adaptar currículo para vaga

Não poluir header principal se isso exigir redesign.

================================================== 11. Testes
==================================================

Adicionar testes simples para:

- cada rota renderiza;
- metadata básica existe, se o padrão do projeto permitir testar;
- sitemap inclui as 4 páginas;
- CTA aponta para a rota correta;
- tracking gera payload esperado;
- FAQPage só existe quando há FAQ.

Não criar teste frágil baseado em textos enormes.

================================================== 12. Critérios de aceite
==================================================

A implementação estará concluída quando:

- /curriculo-ats abre corretamente;
- /adaptar-curriculo-para-vaga abre corretamente;
- /curriculo-gupy abre corretamente;
- /modelo-curriculo-ats abre corretamente;
- todas têm CTA funcional;
- todas têm metadata;
- todas têm JSON-LD WebPage;
- todas têm BreadcrumbList;
- todas têm FAQPage quando houver FAQ;
- todas estão no sitemap;
- tracking seo_page_viewed e seo_page_cta_clicked funciona;
- build do @earlycv/web passa;
- check/test específicos novos passam;
- não houve alteração em pagamento, dashboard ou fluxo principal.

Ao final, retorne:

1. resumo do que foi implementado;
2. arquivos criados/alterados;
3. rotas criadas;
4. eventos de tracking criados;
5. links internos adicionados;
6. comandos executados;
7. status de build/check/test;
8. pendências ou limitações;
9. recomendação para Fase 3: hub de palavras-chave.

# FASE 3

Agora vamos implementar a Fase 3 do SEO do EarlyCV: hub de palavras-chave para currículo.

Objetivo:
Criar uma página utilitária indexável, com alto potencial de SEO, que organize palavras-chave por área, cargo e senioridade, e conecte o usuário ao fluxo de análise gratuita do EarlyCV.

Rota:

- /palavras-chave-curriculo

Importante:
Essa página não deve ser só um artigo. Ela deve funcionar como uma biblioteca prática de consulta.

Objetivos estratégicos:

- capturar buscas como:
  - palavras-chave para currículo;
  - palavras-chave currículo ATS;
  - competências para currículo;
  - habilidades para currículo;
  - palavras-chave currículo tecnologia;
  - palavras-chave currículo administrativo;
  - palavras-chave currículo gerente;
- educar o usuário;
- evitar que ele copie palavras aleatórias;
- levar para o CTA:
  “Descubra quais palavras-chave da vaga estão faltando no seu currículo.”

Estrutura da página:

1. Hero

Headline:
“Palavras-chave para currículo: lista por área, cargo e senioridade”

Subheadline:
“Veja exemplos de termos que podem aparecer em vagas e entenda como usar palavras-chave no currículo sem exagerar ou inventar experiência.”

CTA:
“Analisar palavras-chave do meu currículo”

2. Alerta educativo

Criar um box explicando:
“Não copie palavras-chave aleatórias. O ideal é usar apenas termos que façam sentido para sua experiência e para a vaga desejada.”

3. Explicação rápida

Seções:

- O que são palavras-chave no currículo;
- Como ATS e recrutadores usam esses termos;
- Onde colocar palavras-chave:
  - resumo;
  - experiência;
  - competências;
  - projetos;
  - formação;
- Quando não usar uma palavra-chave.

4. Lista por área

Criar blocos para pelo menos estas áreas:

- Tecnologia;
- Dados e BI;
- Produto;
- Marketing;
- Vendas;
- Financeiro;
- RH;
- Administrativo;
- Engenharia;
- Saúde;
- Jurídico;
- Atendimento ao cliente;
- Gestão/Liderança.

Cada área deve conter cargos e palavras-chave.

Formato recomendado:

Área: Tecnologia

Cargo: Desenvolvedor Backend

Tabela:

- Palavra-chave;
- Onde usar;
- Quando faz sentido.

Exemplo:

- APIs REST | Experiência / Competências | Quando você desenvolveu ou integrou APIs
- Microsserviços | Experiência | Quando trabalhou com arquitetura distribuída
- Docker | Competências / Projetos | Quando usou containers em ambiente real
- PostgreSQL | Competências / Experiência | Quando trabalhou com banco relacional

5. CTA contextual entre blocos

Depois de algumas áreas, inserir CTA compacto:
“Quer saber quais dessas palavras aparecem na sua vaga? Cole a descrição da vaga e compare com seu currículo.”

6. FAQ

Perguntas:

- Quantas palavras-chave devo colocar no currículo?
- Posso colocar palavras-chave que não domino?
- Onde colocar competências técnicas?
- Palavras-chave garantem aprovação em ATS?
- Devo adaptar palavras-chave para cada vaga?
- O que fazer quando a vaga tem muitos requisitos?

7. SEO

Metadata:
title:
“Palavras-chave para currículo: lista por área e cargo | EarlyCV”

description:
“Veja exemplos de palavras-chave para currículo por área, cargo e senioridade. Aprenda como usar termos da vaga sem exagerar e compare seu CV com a vaga no EarlyCV.”

Schema:

- WebPage;
- FAQPage;
- BreadcrumbList.

8. Tracking

Eventos:

- seo_page_viewed
  - slug="palavras-chave-curriculo"
  - page_type="keyword_hub"

- keyword_section_viewed, se houver tracking de scroll ou interseção simples
  - area

- seo_page_cta_clicked
  - slug="palavras-chave-curriculo"
  - location

9. Links internos

Adicionar links para:

- /curriculo-ats
- /adaptar-curriculo-para-vaga
- /curriculo-gupy
- artigos do blog sobre palavras-chave e ATS.

10. Critérios de aceite

- Página abre em /palavras-chave-curriculo;
- Conteúdo está organizado por área;
- Tem CTA funcional;
- Tem FAQ;
- Tem metadata;
- Tem schema;
- Está no sitemap;
- Tem tracking;
- Layout mobile está bom;
- Não há promessa de aprovação ou contratação;
- Não há estatísticas inventadas;
- Build/lint/typecheck passam.

Ao final, retornar:

1. arquivos criados/alterados;
2. resumo da estrutura;
3. como adicionar novas áreas/cargos;
4. eventos criados;
5. próximos passos para páginas por profissão.
