# TASK A FAZER - ORDEM DE PRIORIDADE.

1. Colocar a rota /pagamentos dentro do padrão do site, com exibição do header e logo acima como em recuperar senha
2. Personalizar o erro 404 para padrão do site
3. Suspense no header da landing para não mudar status quando carrega.
4. Centrar o ajustes feitos na pagina versão desktop (tela grande).

5. Ao fazer a compra pelo seu já usar 1 crédito para liberar o cv.
6. Ao liberar o CV, teve que atualizar a tela para diminuir o crédito, tem que atualizar automático.
7. Criar rota para entrar e outra para criar-conta, a mesma rota ta gerando confusão.

8. Ajustar COPY onde aparecer o termo ATS.
9. Layout do score ats no resultado quebrado.
10. criar um suspense no loanding da tela result no card abaixo do ats score (esta mudando estado na tela)
11. Trocar o botão "COmprar Cŕeditos" quando logado no cta do resultado (mudar para Liberar meu CV agora.)

==================================================================

# PENDENCIAS

==================================================================

Search Console Depois do deploy:
enviar ou reprocessar sitemap.xml;
inspecionar manualmente:
/curriculo-ats
/adaptar-curriculo-para-vaga
/curriculo-gupy
/modelo-curriculo-ats
solicitar indexação das quatro.

# Novas Features:

1. Log de exclusão de conta, saber quem exclui e pq?

========================================================

# Criação BLOG

========================================================

# FASE 3

Vamos implementar a Fase 3 do SEO do EarlyCV: hub utilitário de palavras-chave para currículo.

Contexto:
A Fase 1 criou o blog:

- /blog
- /blog/[slug]

A Fase 2 criou páginas SEO transacionais com registry + rota dinâmica controlada:

- /curriculo-ats
- /adaptar-curriculo-para-vaga
- /curriculo-gupy
- /modelo-curriculo-ats

A Fase 2 está validada com:

- check @earlycv/web ✅
- test @earlycv/web ✅
- build @earlycv/web ✅
- sitemap ✅
- metadata/JSON-LD ✅
- tracking SEO ✅

Objetivo da Fase 3:
Criar a página pública /palavras-chave-curriculo como um hub utilitário indexável, diferente do artigo /blog/palavras-chave-curriculo.

Essa página deve capturar buscas sobre:

- palavras-chave para currículo;
- competências para currículo;
- habilidades para currículo;
- palavras-chave currículo ATS;
- palavras-chave por área;
- palavras-chave por cargo;
- palavras-chave para tecnologia, dados, vendas, marketing, RH, financeiro, administrativo, engenharia etc.

Importante:

- Não criar CMS.
- Não criar ferramenta interativa ainda.
- Não criar páginas por profissão ainda.
- Não copiar conteúdo de concorrentes.
- Não inventar estatísticas.
- Não prometer aprovação, entrevista ou contratação.
- Não dizer que palavras-chave garantem passar em ATS.
- Manter a arquitetura de registry da Fase 2.
- Evitar criar um segundo sistema paralelo se o registry atual puder ser evoluído.
- Preferir adicionar pageType: "hub" ao registry atual.
- Se necessário, adicionar campos opcionais específicos para hubs, como keywordGroups.

URL pública:

- /palavras-chave-curriculo

Diferença em relação ao artigo:

- /blog/palavras-chave-curriculo ensina como usar palavras-chave;
- /palavras-chave-curriculo lista termos por área/cargo/senioridade e converte para análise gratuita.

==================================================

1. # Arquitetura

Reusar a base de seo-pages criada na Fase 2.

Adicionar suporte a pageType, se ainda não existir:

pageType:

- "transactional"
- "hub"
- futuramente "profession"

Para o hub, adicionar estrutura tipada, por exemplo:

keywordGroups: [
{
area: "Tecnologia",
description: "...",
roles: [
{
title: "Desenvolvedor Backend",
seniority?: "Júnior | Pleno | Sênior | Geral",
keywords: [
{
term: "APIs REST",
whereToUse: "Experiência / Competências",
whenItMakesSense: "Quando você desenvolveu ou integrou APIs em projetos reais."
}
]
}
]
}
]

Se o conteúdo ficar grande, criar arquivo próprio:

apps/web/src/lib/seo-pages/pages/palavras-chave-curriculo.ts

e agregar em pages.ts.

Não criar namespace hub-pages separado nesta fase, salvo se houver motivo técnico muito forte.

================================================== 2. Conteúdo da página /palavras-chave-curriculo
==================================================

SEO title:
"Palavras-chave para currículo: lista por área e cargo | EarlyCV"

SEO description:
"Veja exemplos de palavras-chave para currículo por área, cargo e senioridade. Aprenda como usar termos da vaga sem exagerar e compare seu CV com a vaga no EarlyCV."

Hero title:
"Palavras-chave para currículo: lista por área, cargo e senioridade"

Hero description:
"Veja exemplos de termos que aparecem em vagas e entenda como usar palavras-chave no currículo sem exagerar ou inventar experiência."

CTA hero:
"Analisar meu currículo grátis"

Mensagem de alerta no topo:
"Não copie palavras-chave aleatórias. O ideal é usar apenas termos que façam sentido para sua experiência e para a vaga desejada."

Seções obrigatórias:

1. O que são palavras-chave no currículo
   Explicar de forma simples.

2. Como usar palavras-chave sem exagerar
   Reforçar:

- usar contexto;
- não colocar termos que não domina;
- adaptar para cada vaga;
- evitar lista solta sem evidência.

3. Onde colocar palavras-chave
   Explicar:

- resumo profissional;
- experiência;
- competências;
- projetos;
- certificações;
- formação.

4. Lista por área e cargo
   Criar grupos para pelo menos estas áreas:

- Tecnologia;
- Dados e BI;
- Produto;
- Marketing;
- Vendas;
- Financeiro;
- RH;
- Administrativo;
- Engenharia;
- Atendimento ao cliente;
- Gestão/Liderança.

Cada área deve ter pelo menos 2 cargos.
Cada cargo deve ter pelo menos 8 palavras-chave.
Cada palavra-chave deve ter:

- termo;
- onde usar;
- quando faz sentido.

Exemplo:

Área: Tecnologia

Cargo: Desenvolvedor Backend

- APIs REST | Experiência / Competências | Quando você desenvolveu ou integrou APIs.
- Microsserviços | Experiência | Quando trabalhou com serviços distribuídos.
- Docker | Competências / Projetos | Quando usou containers em projetos reais.
- PostgreSQL | Competências / Experiência | Quando trabalhou com banco relacional.
- Node.js | Competências / Experiência | Quando desenvolveu aplicações backend com Node.
- Testes automatizados | Experiência / Competências | Quando escreveu ou manteve testes.
- CI/CD | Experiência / Competências | Quando participou de pipelines de entrega.
- AWS | Competências / Projetos | Quando usou serviços de nuvem em projetos.

5. CTA contextual no meio da página
   Depois de algumas áreas, inserir CTA:

Título:
"Quer saber quais palavras da vaga faltam no seu currículo?"

Texto:
"O EarlyCV compara seu currículo com a vaga e mostra lacunas, pontos fortes e termos relevantes para melhorar sua aderência."

Botão:
"Analisar meu currículo grátis"

6. Erros comuns
   Listar:

- copiar a descrição da vaga inteira;
- colocar ferramentas que não domina;
- repetir palavra-chave sem contexto;
- criar seção de competências gigante;
- ignorar experiências reais mais relevantes;
- usar o mesmo currículo para todas as vagas.

7. FAQ

Perguntas:

- Quantas palavras-chave devo colocar no currículo?
- Posso colocar palavras-chave que não domino?
- Onde colocar competências técnicas?
- Palavras-chave garantem aprovação em ATS?
- Devo adaptar palavras-chave para cada vaga?
- O que fazer quando a vaga tem muitos requisitos?

================================================== 3. Visual/UX
==================================================

A página deve parecer uma biblioteca prática, não um artigo longo comum.

Requisitos visuais:

- hero parecido com páginas SEO da Fase 2;
- alerta educativo no topo;
- navegação por áreas, se simples;
- cards por área;
- blocos por cargo;
- tabela responsiva ou layout em cards para keywords;
- CTA entre blocos;
- FAQ no final;
- links internos bem visíveis.

Mobile:

- evitar tabela quebrada;
- se tabela ficar ruim no mobile, renderizar cada keyword como card;
- CTA full-width;
- boa leitura.

Evitar:

- lista gigante sem estrutura;
- conteúdo escondido demais;
- accordion obrigatório para tudo;
- componentes client desnecessários;
- busca/filtro nesta fase, salvo se for extremamente simples e não aumentar bundle.

================================================== 4. Links internos
==================================================

Adicionar links para:

- /curriculo-ats
- /adaptar-curriculo-para-vaga
- /curriculo-gupy
- /modelo-curriculo-ats
- /blog/palavras-chave-curriculo
- /blog/curriculo-ats
- /blog/como-adaptar-curriculo-para-vaga

Atualizar links internos das páginas existentes:

- /curriculo-ats deve linkar para /palavras-chave-curriculo;
- /adaptar-curriculo-para-vaga deve linkar para /palavras-chave-curriculo;
- /modelo-curriculo-ats deve linkar para /palavras-chave-curriculo;
- /blog/palavras-chave-curriculo deve linkar para /palavras-chave-curriculo, se simples.

================================================== 5. SEO técnico
==================================================

Adicionar ao registry:

- slug: palavras-chave-curriculo
- path: /palavras-chave-curriculo
- published: true
- pageType: "hub"

Gerar:

- metadata;
- canonical;
- OG/Twitter;
- robots;
- JSON-LD WebPage;
- BreadcrumbList;
- FAQPage condicional.

Adicionar ao sitemap.

Garantir que a rota /palavras-chave-curriculo não conflita com /blog/palavras-chave-curriculo.

================================================== 6. Tracking
==================================================

Reusar eventos:

seo_page_viewed
Propriedades:

- slug="palavras-chave-curriculo"
- path="/palavras-chave-curriculo"
- page_type="hub"
- source="seo_page"

seo_page_cta_clicked
Propriedades:

- slug="palavras-chave-curriculo"
- path="/palavras-chave-curriculo"
- location="hero" | "middle" | "bottom"
- target="/adaptar"
- source="seo_page"

Adicionar evento opcional apenas se for simples e server/client boundary ficar limpo:

keyword_hub_area_clicked
ou
keyword_hub_area_viewed

Propriedades:

- area
- slug="palavras-chave-curriculo"

Não implementar scroll tracking complexo nesta fase.

================================================== 7. Footer/menu
==================================================

Se footer já tem Blog, Currículo ATS e Adaptar currículo, adicionar discretamente:

- Palavras-chave para currículo

Não poluir header principal.

================================================== 8. Testes
==================================================

Adicionar/ajustar testes focados:

- /palavras-chave-curriculo abre corretamente;
- slug está no registry;
- pageType="hub";
- sitemap inclui /palavras-chave-curriculo;
- metadata existe;
- JSON-LD WebPage/Breadcrumb existe;
- FAQPage existe quando faq existe;
- CTA aponta para /adaptar;
- tracking payload usa page_type="hub";
- links internos principais existem;
- build @earlycv/web passa.

Não criar teste frágil baseado em todo o texto da página.

================================================== 9. Critérios de aceite
==================================================

Concluído quando:

- /palavras-chave-curriculo abre;
- conteúdo está organizado por área e cargo;
- cada cargo tem keywords com termo, onde usar e quando faz sentido;
- há CTA no hero, meio e fim;
- há alerta para não copiar palavras aleatórias;
- há FAQ;
- metadata/canonical/OG/Twitter/robots funcionam;
- JSON-LD WebPage/Breadcrumb/FAQ funcionam;
- sitemap inclui a página;
- tracking funciona com page_type="hub";
- links internos foram atualizados;
- footer tem link discreto;
- check/test/build @earlycv/web passam;
- não houve alteração em pagamento/dashboard/fluxos core.

Ao final, retorne:

1. resumo do que foi implementado;
2. arquivos criados/alterados;
3. estrutura dos keywordGroups;
4. links internos atualizados;
5. eventos de tracking;
6. comandos executados;
7. status check/test/build;
8. pendências/limitações;
9. recomendação para Fase 4: páginas por profissão.
