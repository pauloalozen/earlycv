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

Agora vamos implementar a Fase 2 do SEO do EarlyCV: páginas transacionais indexáveis.

Contexto:
A Fase 1 criou a base do blog com /blog e /blog/[slug]. Agora queremos criar páginas SEO mais próximas da conversão, com conteúdo evergreen e CTA forte para análise gratuita.

Objetivo:
Criar páginas públicas, cacheáveis e indexáveis para capturar buscas com intenção comercial/informacional forte.

Rotas da Fase 2:

- /curriculo-ats
- /adaptar-curriculo-para-vaga
- /curriculo-gupy
- /modelo-curriculo-ats

Não implementar ainda:

- página de 500 palavras-chave;
- páginas por profissão;
- ferramenta extratora de keywords;
- CMS;
- newsletter.

Requisitos por página:

Cada página deve ter:

1. hero com headline clara;
2. subtítulo;
3. CTA para análise gratuita;
4. seções educativas;
5. exemplos práticos;
6. FAQ;
7. links internos para artigos do blog;
8. links para outras páginas SEO;
9. schema adequado:
   - WebPage;
   - FAQPage quando houver FAQ;
   - BreadcrumbList;
10. metadados SEO:

- title;
- description;
- canonical;
- Open Graph.

Tom de comunicação:

- claro;
- direto;
- sem promessa de contratação;
- sem dizer “garantimos passar no ATS”;
- reforçar que o EarlyCV aumenta clareza, compatibilidade e aderência com a vaga.

Página 1: /curriculo-ats

Objetivo:
Capturar buscas sobre currículo ATS.

Headline sugerida:
“Currículo ATS: crie um currículo que sistemas conseguem ler”

Subheadline:
“Entenda como sistemas de triagem analisam currículos e veja como melhorar a compatibilidade do seu CV com cada vaga.”

Seções:

- O que é um currículo ATS;
- Por que currículos bonitos demais podem atrapalhar;
- Erros comuns;
- Como estruturar um currículo compatível;
- Como usar palavras-chave;
- Exemplo de estrutura;
- Como o EarlyCV ajuda;
- FAQ.

CTA:
“Analisar meu currículo grátis”

Página 2: /adaptar-curriculo-para-vaga

Objetivo:
Capturar busca de alta intenção: pessoas querendo adaptar CV.

Headline sugerida:
“Adapte seu currículo para cada vaga sem inventar experiência”

Subheadline:
“Compare seu currículo com a descrição da vaga, identifique lacunas e gere uma versão mais alinhada ao que a empresa procura.”

Seções:

- Por que adaptar o currículo;
- O que deve mudar de uma vaga para outra;
- O que não deve ser inventado;
- Como destacar experiências relevantes;
- Como usar palavras-chave da vaga;
- Exemplo antes/depois;
- Como o EarlyCV faz a análise;
- FAQ.

Página 3: /curriculo-gupy

Objetivo:
Capturar buscas brasileiras sobre Gupy.

Headline sugerida:
“Currículo para Gupy: como aumentar a aderência com a vaga”

Subheadline:
“Veja como estruturar seu currículo, usar palavras-chave e evitar erros que prejudicam sua leitura em plataformas de recrutamento.”

Cuidados:

- Não afirmar funcionamento interno exato da Gupy sem fonte.
- Não dizer que a Gupy dá uma nota específica se não houver comprovação.
- Usar linguagem segura:
  “plataformas como Gupy podem considerar informações estruturadas, aderência textual e dados fornecidos na candidatura.”

Seções:

- Por que muita gente sente que o currículo não avança;
- O que normalmente prejudica candidaturas;
- Palavras-chave e aderência com a vaga;
- Formatação e clareza;
- Como adaptar sem mentir;
- Como o EarlyCV pode ajudar antes de se candidatar;
- FAQ.

Página 4: /modelo-curriculo-ats

Objetivo:
Capturar busca por modelo.

Headline sugerida:
“Modelo de currículo ATS simples, limpo e fácil de ler”

Subheadline:
“Veja uma estrutura recomendada para criar um currículo objetivo, compatível com triagens automatizadas e fácil para recrutadores lerem.”

Seções:

- Estrutura recomendada;
- Cabeçalho;
- Resumo profissional;
- Experiência;
- Competências;
- Formação;
- Projetos;
- O que evitar;
- Exemplo de modelo em texto;
- CTA para adaptar o modelo à vaga;
- FAQ.

Tracking:
Criar eventos:

- seo_page_viewed
  - slug
  - page_type="transactional_seo"
- seo_page_cta_clicked
  - slug
  - location
  - target

Sitemap:
Adicionar todas as páginas ao sitemap.

Footer/menu:
Se fizer sentido, adicionar links discretos no footer para:

- Blog
- Currículo ATS
- Adaptar currículo para vaga

Critérios de aceite:

- As 4 rotas abrem corretamente;
- Todas têm metadata;
- Todas têm CTA;
- Todas têm FAQ;
- Todas entram no sitemap;
- Todas têm tracking;
- Build/lint/typecheck passam;
- Nenhum fluxo existente foi quebrado.

Ao final, retorne:

1. arquivos criados/alterados;
2. resumo das páginas;
3. eventos criados;
4. comandos executados;
5. próximos passos para Fase 3.

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
