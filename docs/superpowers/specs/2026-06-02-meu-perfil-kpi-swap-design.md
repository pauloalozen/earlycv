# Meu Perfil KPI Swap Design

## Contexto

A rota `/meu-perfil` herdou um KPI de `Melhoria recente`, mas essa metrica ficou ambigua no contexto novo da tela. No `dashboard_old`, ela dependia de `improvement` por analise (`scoreFinal - scoreBefore`). Em `/meu-perfil`, a leitura ficou menos clara e mais suscetivel a inconsistencias entre score novo, fallback legado e ordenacao dos highlights.

Em vez de insistir nessa metrica, a decisao aprovada e trocar o card por um KPI mais operacional e estavel.

## Decisao

Substituir o trio atual por:

- `Candidaturas ativas`
- `CVs analisados`
- `Score medio`

Esses KPIs devem representar o total real do usuario, nao apenas o recorte de `highlights(3)` exibido na lista de recentes.

## Objetivo

- remover uma metrica ambigua da area principal do perfil
- deixar os KPIs mais alinhados ao uso atual da rota `/meu-perfil`
- aproveitar a logica de score retrocompativel ja implementada, sem ampliar escopo desnecessariamente

## Definicoes

### Candidaturas ativas

Quantidade total de candidaturas nao encerradas e nao arquivadas do usuario.

A classificacao deve seguir a taxonomia ja usada em `/candidaturas`, reaproveitando a nocao de status abertos/em processo e evitando criar uma terceira definicao de "ativo".

### CVs analisados

Quantidade total de candidaturas/analises do usuario com score resolvido disponivel.

Isso inclui:

- score novo vindo de `bestScore`
- score legado resolvido por fallback quando necessario

Esse KPI nao deve depender apenas dos 3 highlights recentes.

### Score medio

Deve representar a media global dos scores resolvidos do usuario, nao apenas a media do subconjunto exibido na lista de recentes.

## Escopo de implementacao

- remover o card `Melhoria recente`
- trocar o rotulo e a regra do primeiro KPI para `Candidaturas ativas`
- trocar o KPI de contagem atual para `CVs analisados`
- manter a lista de recentes baseada em `highlights(3)`
- introduzir uma fonte de summary separada para os KPIs reais do usuario

## Limites intencionais

- nao reintroduzir a logica de `Melhoria recente`
- nao sobrecarregar o endpoint de `highlights` com responsabilidades de summary agregado
- nao alterar a lista de candidaturas recentes
- nao mudar o layout estrutural dos cards, apenas a semantica e os valores exibidos

## Testes

Atualizar `/meu-perfil/page.test.tsx` para validar:

- presenca dos novos labels `Candidaturas ativas` e `CVs analisados`
- ausencia do label `Melhoria recente`
- valores coerentes com o summary total mockado, independentemente do subconjunto de highlights
- manutencao da lista de recentes com score novo e legado

## Resultado esperado

Os KPIs de `/meu-perfil` passam a comunicar melhor o estado atual do usuario:

- quantas candidaturas seguem ativas
- quantos CVs/analises ja geraram score
- qual o score medio dessas analises

Com isso, a area principal do perfil fica mais estavel, mais clara, menos dependente de metrica derivada historica e sem distorcer os numeros por causa do recorte de apenas 3 highlights.
