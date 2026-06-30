# Meu Perfil Score Retrocompat Design

## Contexto

A rota `/meu-perfil` substituiu a antiga `/dashboard`, mas hoje exibe scores incorretos ou vazios em parte do historico. O problema aparece porque a tela nova usa `bestScore` quase como unica fonte, enquanto a rota antiga preservava dados legados e conseguia derivar score a partir dos sinais da analise quando o campo principal nao existia.

Precisamos manter `bestScore` como fonte oficial da logica nova de candidaturas, sem quebrar retrocompatibilidade com candidaturas e analises antigas.

## Regra de produto

- `bestScore` continua sendo a fonte preferencial para a experiencia nova de candidaturas.
- Quando `bestScore` estiver ausente, `/meu-perfil` deve cair para a mesma logica legada de score usada pela rota antiga.
- A regra precisa valer tanto para os KPIs quanto para a lista de `Candidaturas recentes`.
- Se nao existir score novo nem legado, a UI continua exibindo `—`.

## Abordagem aprovada

Aplicar a retrocompatibilidade localmente em `/meu-perfil`, sem alterar o contrato principal de `listJobApplicationHighlights` neste passo.

## Design

### Fonte de dados

`/meu-perfil` continuara carregando `listJobApplicationHighlights(3)` como faz hoje. Para itens com `bestScore === null`, a pagina fara uma resolucao complementar de score legado usando a mesma base conceitual da rota antiga.

### Regra de resolucao

Cada item da lista tera um `displayScore` resolvido na seguinte ordem:

1. `bestScore`
2. score legado derivado da analise historica
3. `null`

Quando o score legado vier de payload historico, a extracao deve reaproveitar a logica existente em `extractDashboardAnalysisSignal`, em vez de criar uma segunda interpretacao dos dados.

### Escopo visual afetado

Os seguintes pontos passam a usar `displayScore` em vez de depender apenas de `bestScore`:

- KPI `Score medio`
- KPI `Melhoria recente`, quando a ordenacao/colecao depender de itens com score resolvido
- score exibido em cada item da lista `Candidaturas recentes`

### Limites intencionais

- Nao mudar a API principal de candidaturas neste passo.
- Nao alterar a semantica de `bestScore`.
- Nao espalhar fallback legado em varias telas diferentes agora.
- Nao reimplementar parsing historico fora dos helpers ja existentes se o reaproveitamento for viavel.

## Estrutura proposta

Criar uma pequena resolucao de score focada em apresentacao da rota `/meu-perfil`:

- helper local ou helper compartilhado pequeno, se isso reduzir duplicacao sem ampliar escopo
- responsabilidade unica: devolver score exibivel para o perfil
- preferencia pelo menor ponto de extensao correto

Se a pagina precisar buscar dados adicionais para retrocompatibilidade, isso deve acontecer apenas para os itens sem `bestScore`, para evitar custo desnecessario.

## Erros e fallback

- Se a carga complementar de score legado falhar, a pagina nao quebra.
- O item afetado cai para `—`.
- O restante dos scores continua sendo renderizado normalmente.

## Testes

Adicionar cobertura em `/meu-perfil/page.test.tsx` para validar:

- uso de `bestScore` quando presente
- fallback para score legado quando `bestScore` vier `null`
- manutencao de `—` quando nao houver score em nenhuma das fontes
- KPIs calculados com score resolvido, nao apenas com score novo

## Resultado esperado

`/meu-perfil` volta a exibir scores coerentes para dados novos e antigos, preservando a prioridade da modelagem nova de candidaturas e sem introduzir mudanca ampla de contrato neste momento.
