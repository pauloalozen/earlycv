# Especificacao de design - paridade visual entre verificar-email e esqueceu-senha

## Contexto

A rota `apps/web/src/app/verificar-email/page.tsx` ja define a identidade visual monocromatica ativa do produto para fluxos de autenticacao. A rota `apps/web/src/app/esqueceu-senha/page.tsx` usa linguagem parecida, mas com variacoes estruturais (logo custom local, medidas diferentes de card/espacamento e pequenos desvios de estilo).

Objetivo: aplicar copia 100% fiel da estrutura visual de `verificar-email` em `esqueceu-senha`, preservando o comportamento funcional da recuperacao de senha.

## Escopo

Incluido:
- Igualar shell visual (grain, background, alinhamento e paddings de viewport).
- Igualar bloco de marca (componente `Logo` e selo `v1.2`) e seu espacamento.
- Igualar card principal (largura maxima, borda, raio, sombra, padding e z-index).
- Manter os estados e a logica do formulario de forgot password (`idle/loading/done/error`).

Excluido:
- Mudancas de endpoint/API.
- Refactor amplo de estilos para sistema compartilhado global.
- Alteracoes de copy que mudem significado funcional.

## Abordagem escolhida

Opcao recomendada e aprovada: extrair um layout-base compartilhado de auth para evitar divergencia futura.

Implementar um wrapper visual reutilizavel no app web (ex.: `apps/web/src/components/auth/auth-mono-shell.tsx`) que encapsula a estrutura visual hoje presente em `verificar-email`:
- camada de grain fixa com opacidade e blend mode;
- `main` com gradiente radial e centralizacao;
- cabecalho com `Logo` + badge `v1.2`;
- container card com estilos identicos;
- area de conteudo interna via `children`.

Depois:
- adaptar `verificar-email` para consumir o wrapper sem regressao visual;
- adaptar `esqueceu-senha` para consumir o mesmo wrapper e manter apenas seu conteudo funcional interno.

## Estrutura tecnica

- Novo componente compartilhado de apresentacao:
  - `apps/web/src/components/auth/auth-mono-shell.tsx`
- Paginas impactadas:
  - `apps/web/src/app/verificar-email/page.tsx`
  - `apps/web/src/app/esqueceu-senha/page.tsx`

Diretriz: manter estilo inline coerente com padrao existente nessas rotas, sem alterar assinatura publica das APIs de auth.

## Fluxo de dados e comportamento

Sem alteracoes de fluxo:
- submit continua em `POST /auth/forgot-password` no web app;
- estados de UI e mensagens permanecem equivalentes ao comportamento atual;
- `verificar-email` continua aplicando guard de sessao e comportamento de redirect atual.

## Tratamento de erros e estados

- Estados de erro/sucesso da tela de forgot password permanecem no conteudo interno do card.
- O wrapper nao conhece estado de negocio; e puramente visual.
- Se houver erro de submit, renderizacao do alerta continua no mesmo ponto hierarquico dentro do card.

## Testes e verificacao

Minimo necessario:
- Validacao manual das duas rotas em desktop e mobile para confirmar paridade visual estrutural.
- Garantir que submit de forgot password continua funcional (estado loading, done e error).
- Rodar verificacao de qualidade do app web (lint/teste relevante do workspace, conforme scripts disponiveis).

## Riscos e mitigacao

- Risco: pequenas diferencas de espacamento ao migrar para wrapper.
  - Mitigacao: mover os mesmos valores literais da tela de referencia para o wrapper.
- Risco: regressao de comportamento por transformar pagina em server/client indevidamente.
  - Mitigacao: manter `esqueceu-senha` como client para formulario e `verificar-email` com contrato atual de server page.

## Criterios de aceite

- `esqueceu-senha` exibe estrutura visual indistinguivel de `verificar-email` em shell, marca e card.
- Conteudo/acoes de forgot password permanecem especificos da rota.
- `verificar-email` permanece funcional com o novo wrapper.
- Nao ha mudanca em endpoints nem em regras de negocio.
