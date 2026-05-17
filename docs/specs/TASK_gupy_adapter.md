# Contexto: Adapter Gupy — Ingestão de Vagas

## Branch de trabalho

**Trabalhar exclusivamente na branch `develop`.** Nunca commitar em `main`.

```bash
git checkout develop && git pull
git checkout -b feature/job-ingestion-gupy-adapter
```

---

## Objetivo

Implementar o adapter real da Gupy substituindo o mock `custom-api.adapter.ts` existente.
O adapter deve consumir a API pública dos portais de carreira Gupy de cada empresa cadastrada
no painel admin e ingerir as vagas no pipeline existente.

---

## Como a API da Gupy funciona

### Endpoint público (sem autenticação)

Cada empresa que usa Gupy tem um subdomínio próprio. A API pública que alimenta o portal
de carreiras delas é acessível sem token:

```
GET https://{subdomain}.gupy.io/api/v1/jobs
```

Exemplos de subdomínio: `ifood`, `nubank`, `stone`, `totvs`, `ambev`.

### Parâmetros obrigatórios para vagas públicas externas

```
status=published
publicationType=external
fields=all
limit=10        (máximo recomendado: 10–20)
offset=0        (paginação por offset)
```

### Paginação

A API retorna um objeto com `total` e `results`. Paginar incrementando `offset` por `limit`
até `offset >= total`.

```json
{
  "total": 47,
  "results": [ ... ]
}
```

### Campos retornados com fields=all (relevantes para o EarlyCV)

| Campo API | Uso | Observação |
|---|---|---|
| `id` | Base do canonicalKey | Numérico, único por empresa |
| `name` | Título da vaga | |
| `description` | Descrição completa | HTML ou texto |
| `responsibilities` | Responsabilidades | Pode ser null |
| `prerequisites` | Requisitos | Pode ser null |
| `publishedAt` | Data de publicação | ISO 8601 — crítico para firstSeenAt |
| `workplaceType` | `hybrid`, `on-site`, `remote` | |
| `addressCity` | Cidade | |
| `addressState` | Estado | |
| `addressCountry` | País | |
| `remoteWorking` | boolean | |
| `departmentName` | Área/departamento | |
| `roleName` | Cargo | |
| `applicationDeadline` | Prazo de inscrição | Pode ser null |
| `careerPageId` | ID da página de carreiras | |
| `careerPageName` | Nome da página | |
| `type` | Tipo de vaga | CLT, estágio, PJ etc |

### URL canônica da vaga para candidatura

```
https://{subdomain}.gupy.io/jobs/{id}?jobBoardSource=gupy_public_page
```

---

## Como o adapter se encaixa na arquitetura existente

### Localização

```
apps/api/src/ingestion/adapters/
├── custom-html.adapter.ts   ← mock, não remover
├── custom-api.adapter.ts    ← mock, não remover
├── gupy.adapter.ts          ← CRIAR AQUI
└── index.ts                 ← registrar o adapter Gupy
```

### Contrato que o adapter deve implementar

Ver tipos em `apps/api/src/ingestion/types.ts`. O adapter deve retornar observações
normalizadas no formato `JobObservation` já definido no projeto.

Campos críticos do contrato:
- `canonicalKey`: string única e determinística por vaga. Usar formato: `gupy:{subdomain}:{jobId}`
- `externalId`: o `id` numérico da vaga retornado pela API Gupy
- `title`: campo `name` da API
- `description`: concatenação estruturada de `description` + `responsibilities` + `prerequisites`
- `url`: URL canônica de candidatura
- `publishedAt`: campo `publishedAt` da API (ISO 8601)
- `location`: composição de `addressCity`, `addressState`, `addressCountry`
- `workplaceType`: mapear `hybrid`→`hybrid`, `on-site`→`onsite`, `remote`→`remote`
- `department`: `departmentName`
- `role`: `roleName`
- `rawData`: objeto completo retornado pela API (para auditoria)

### Como o JobSource vai ser cadastrado no admin

O campo relevante do `JobSource` para o adapter Gupy é o identificador da empresa.
O subdomínio Gupy da empresa deve ser armazenado em um campo do `JobSource` —
usar `externalId` ou `config` (verificar schema atual em `packages/database/prisma/schema.prisma`).

O adapter deve ler esse campo para montar a URL base da requisição.

### Pipeline de ingestão existente

O `IngestionService` em `apps/api/src/ingestion/ingestion.service.ts` já orquestra:
- Criação do `IngestionRun`
- Chamada ao adapter via interface
- Upsert dos Jobs com preservação de `firstSeenAt`
- Deduplicação por `canonicalKey`
- Atualização de metadados do `JobSource`

O adapter **não** precisa lidar com upsert, deduplicação ou auditoria — apenas
retornar o array de observações normalizadas.

---

## Invariantes a preservar (nunca violar)

- `canonicalKey` deve ser `gupy:{subdomain}:{jobId}` — determinístico e imutável
- `firstSeenAt` é responsabilidade do pipeline, não do adapter
- Nunca filtrar vagas no adapter por critério de negócio — retornar todas as publicadas
  externas e deixar as capture rules (futura feature) fazerem a filtragem
- Se a API retornar erro em uma página, logar e continuar — não abortar o run inteiro

---

## Comportamento esperado do adapter

1. Receber o `JobSource` com o subdomínio Gupy da empresa
2. Fazer GET na primeira página com `limit=10&offset=0&status=published&publicationType=external&fields=all`
3. Verificar o `total` retornado
4. Paginar até esgotar todos os resultados
5. Para cada vaga, montar a `JobObservation` normalizada
6. Retornar o array completo de observações para o pipeline processar

### Rate limiting e boas práticas

- Adicionar delay de 500ms–1s entre páginas de uma mesma empresa para não sobrecarregar
- Adicionar User-Agent descritivo nos headers: `EarlyCV-Crawler/1.0`
- Timeout de 10s por requisição
- Em caso de 429 (rate limit), aguardar e tentar novamente com backoff simples (1 tentativa)
- Em caso de 404 (empresa não encontrada no Gupy), marcar `JobSource` com erro descritivo

---

## Registro do adapter

Em `apps/api/src/ingestion/adapters/index.ts`, registrar o adapter Gupy com a chave
`gupy` (ou equivalente ao `type` definido no `JobSource`).

Em `apps/api/src/ingestion/ingestion.module.ts`, adicionar o `GupyAdapter` nos providers.

---

## Testes

Criar arquivo `apps/api/src/ingestion/adapters/gupy.adapter.spec.ts` com:
- Teste de paginação (mock de API com 2 páginas)
- Teste de geração correta do `canonicalKey`
- Teste de mapeamento de campos (especialmente `workplaceType` e concatenação de descrição)
- Teste de comportamento em caso de erro de API (deve continuar, não lançar exceção)

---

## Verificação antes de encerrar

```bash
git branch --show-current   # deve retornar feature/job-ingestion-gupy-adapter
npm run check
npm run build
npm run test
```

Se houver nova migration Prisma: `npm run railway:touch-api` e commitar junto.
