# Dashboard Candidatura - Unlock do CV Adaptado

## Contexto

Precisamos ajustar a rota `/dashboard/candidaturas/[id]` para que o card **CV ADAPTADO** permita liberar e baixar o CV sem depender da navegacao para a tela de resultado.

A mudanca deve preservar totalmente o fluxo ja estavel de `/adaptar/resultado` e do checkout/pagamento, evitando regressao.

## Objetivo

Quando a adaptacao ainda estiver bloqueada no detalhe da candidatura:

1. Exibir CTA **Liberar CV**.
2. Se houver credito, liberar na propria tela.
3. Se nao houver credito, direcionar para compra de creditos com o mesmo contexto de unlock do fluxo de resultado.
4. Apos liberar, exibir CTAs **Baixar PDF** e **Baixar DOCX** no proprio card.
5. Apos concluir pagamento, retornar para a mesma candidatura (`/dashboard/candidaturas/[id]`).

## Fora de escopo

- Nao alterar UX principal nem regras de negocio da pagina `/adaptar/resultado`.
- Nao alterar contratos de checkout/conclusao (`/planos`, `/pagamento/*`) alem de consumir o comportamento ja existente.
- Nao reestruturar todo o dominio de candidaturas.

## Estado atual relevante

- `apps/web/src/app/dashboard/candidaturas/[id]/detail-client.tsx`
  - Card `CV ADAPTADO` exibe:
    - `Ver resultado` quando `latest.isUnlocked === true`.
    - `AGUARDANDO DESBLOQUEIO` quando `latest.isUnlocked === false`.
- `apps/web/src/app/adaptar/resultado/page.tsx`
  - Ja contem fluxo completo de unlock com credito e redirecionamento para compra.
- `apps/web/src/app/dashboard/history-action-links.tsx`
  - Ja contem padrao de CTA unlock + download + estados de loading/erro.

## Abordagem escolhida

**Abordagem 1 com desacoplamento:** reaproveitar regras de unlock/compra por meio de modulo compartilhado, sem mudar comportamento funcional das telas existentes.

## Design tecnico

### 1) Modulo compartilhado de regras de unlock

Criar um helper dedicado em `apps/web/src/lib/cv-unlock-flow.ts` para centralizar regras comuns e reduzir duplicacao.

Responsabilidades:

- Montar URL de compra de creditos com contexto:
  - `aid` (adaptationId)
  - `source` (origem da CTA)
  - `kw` (keywords selecionadas quando existirem)
  - `next` (retorno pos-pagamento)
- Sanitizar valores opcionais (ignorar vazios, trim de keywords).
- Expor uma API minima, sem side effects de UI.

Nao responsabilidades:

- Nao fazer fetch.
- Nao controlar estado React.
- Nao emitir telemetria diretamente.

### 2) Integracao no detalhe da candidatura

Arquivo alvo: `apps/web/src/app/dashboard/candidaturas/[id]/detail-client.tsx`.

Comportamento do card `CV ADAPTADO`:

- **Bloqueado + com credito**
  - Exibir CTA `Liberar CV`.
  - Acionar redeem via endpoint ja usado no fluxo de unlock do produto.
  - Exibir estado `Liberando...` durante a requisicao.
  - Evitar clique duplo enquanto estiver em andamento.
  - Em sucesso: trocar para estado liberado e exibir `Baixar PDF` e `Baixar DOCX`.
  - Em erro: exibir mensagem curta e acionavel, sem quebrar layout.

- **Bloqueado + sem credito**
  - Exibir CTA `Liberar CV` apontando para `/planos?...`.
  - URL deve carregar:
    - `aid=<adaptationId>`
    - `source=dashboard-candidatura-unlock`
    - `next=/dashboard/candidaturas/<id>`
    - `kw=<...>` quando houver.

- **Ja liberado**
  - Exibir dois botoes:
    - `Baixar PDF`
    - `Baixar DOCX`
  - Substitui o antigo CTA `Ver resultado` como acao primaria do card.

### 3) Compatibilidade com fluxo atual de resultado

Arquivo de referencia: `apps/web/src/app/adaptar/resultado/page.tsx`.

Diretriz obrigatoria:

- Preservar comportamento funcional atual da rota.
- Se houver extracao para helper compartilhado, fazer apenas extracao mecanica de regras puras, sem alterar:
  - labels,
  - eventos,
  - condicoes de habilitacao,
  - navegacao final.

### 4) Retorno pos-pagamento

Ao clicar em compra a partir do dashboard:

- Encaminhar `next` para `/dashboard/candidaturas/[id]`.
- Checkout/conclusao deve respeitar o retorno para `next` quando presente.
- Se `next` nao estiver disponivel/valido, fluxo segue fallback atual (sem adicionar nova regra ad hoc).

## Erros e resiliencia

- Timeout/rede de redeem: apresentar erro amigavel e manter CTA disponivel para nova tentativa.
- Falta de dados opcionais (`kw`, score detalhado): construir URL minima com `aid`, `source` e `next`.
- Sem adaptacao valida: manter fallback visual atual do card (sem CTA quebrada).

## Telemetria

Manter padrao atual de eventos do produto para unlock/compra/download.

- Se necessario, adicionar `source_detail` especifico para candidatura, sem renomear eventos ja existentes em resultado.
- Objetivo: distinguir origem dashboard vs resultado sem quebrar series historicas.

## Testes

### Testes de componente (dashboard candidatura)

- `locked + credit`: `Liberar CV` -> sucesso -> aparecem `Baixar PDF` e `Baixar DOCX`.
- `locked + no credit`: CTA aponta para `/planos` com `aid`, `source` e `next` corretos.
- `unlocked`: renderiza diretamente os dois CTAs de download.

### Testes de helper compartilhado

- Montagem de URL com e sem keywords.
- Sanitizacao de keywords vazias.
- Preservacao de `next`.

### Nao regressao de resultado

- Garantir que testes atuais de `apps/web/src/app/adaptar/resultado/*` continuam passando sem mudanca de comportamento.

## Riscos e mitigacoes

- **Risco:** acoplamento indevido com logica da tela de resultado.
  - **Mitigacao:** extrair apenas regras puras para helper, manter estado/UI de cada tela isolados.

- **Risco:** divergencia entre unlock do dashboard e resultado.
  - **Mitigacao:** usar mesmo helper de URL/contexto e mesmo contrato de redeem.

- **Risco:** quebra de retorno pos-pagamento.
  - **Mitigacao:** teste especifico com `next` da candidatura e fallback atual intacto.

## Criterios de aceite

1. No card `CV ADAPTADO` da rota `/dashboard/candidaturas/[id]`, quando bloqueado, existe CTA `Liberar CV`.
2. Com credito, o unlock ocorre na propria tela e o card troca para `Baixar PDF` + `Baixar DOCX`.
3. Sem credito, redireciona para compra com contexto e retorna para a mesma candidatura apos pagamento.
4. Fluxo de `/adaptar/resultado` permanece funcionalmente inalterado.
5. Testes cobrindo os cenarios novos passam, sem regressao dos testes existentes relevantes.

## Arquivos previstos para implementacao

- `apps/web/src/lib/cv-unlock-flow.ts` (novo)
- `apps/web/src/app/dashboard/candidaturas/[id]/detail-client.tsx`
- Testes relacionados ao detalhe da candidatura
- Testes do helper compartilhado
- Ajustes minimos de integracao (se estritamente necessario) em `apps/web/src/app/adaptar/resultado/page.tsx`
