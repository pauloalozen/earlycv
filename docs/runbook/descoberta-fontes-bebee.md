# Descoberta de fontes via beBee — Runbook

Data: 2026-10-13
Frequência sugerida: a cada 1–2 meses.
Código: `apps/api/src/scripts/discover-sources-from-bebee.ts`, `apps/api/src/ingestion/bebee-discovery.ts`.

## O que é

O beBee (`bebee.com/br/jobs`) agrega vagas de feeds pagos. A página de cada vaga traz o link de candidatura original; quando esse link cai num ATS que já lemos (Pandapé, Gupy, Sólides, InHire, Workday, Greenhouse...), ele revela a empresa e o board dela.

O script transforma isso em candidatos na aba **Descoberta ATS** do admin. A ingestão das vagas continua pelos nossos adapters — nada do conteúdo da vaga do beBee é copiado.

Primeira rodada (out/2026): 34,6 mil páginas → 1.474 boards novos.

## Passo a passo

### 1. Baixar vagas recentes — local, Paulo ou agente

Pré-requisito: Postgres local ligado (`docker start app-postgres-1`) e `DATABASE_URL` do `.env` da raiz. O banco é usado só pra leitura nesse passo.

Em `apps/api`:

```
npm run discover:bebee-sources -- --limit=20000 >> .cache/bebee-discovery/download.log 2>&1
```

- Baixa só as vagas da página mais recente do sitemap (~1–2 dias, ~16 mil vagas dos feeds certos) que ainda não estão no cache.
- ~42 páginas/min → 20 mil páginas ≈ 8 h. Pode rodar em background (`nohup ... &`).
- Pode interromper a qualquer momento (Ctrl+C / `pkill -f discover-sources-from-bebee`): o que já baixou fica no cache e a próxima execução continua de onde parou.
- Acompanhar: `tail -f .cache/bebee-discovery/download.log`.

### 2. Conferir antes de gravar — local, Paulo

Com um dump recente de produção no banco local (homolog), em `apps/api`:

```
npm run discover:bebee-sources -- --limit=0
```

Gera `.cache/bebee-discovery/report-AAAA-MM-DD.csv`. Filtrar a coluna `situacao` por `novo`: são as empresas que vão entrar na Descoberta.

### 3. Gravar em produção — na máquina do Paulo, apontando pro banco de prod

Em `apps/api`, com a URL pública do Postgres de produção (Railway → Postgres → Variables → `DATABASE_PUBLIC_URL`):

```
DATABASE_URL='<url de prod>' npm run discover:bebee-sources -- --limit=0 --apply
```

- **Sempre `--limit=0`** nesse passo: não baixa nada, só cruza o cache com o banco e cria os candidatos. Se o log mostrar a linha `sitemap (...)`, está baixando — Ctrl+C (nada é gravado antes do download terminar).
- Primeira linha do log tem que dizer `modo APLICANDO`.
- O que já é fonte ou já está na Descoberta é pulado; entra só board novo, como **Pendente**, com lote `bebee-AAAA-MM-DD`.

### 4. Validar e promover — admin de produção, Paulo

Radar Oportunidades (`/admin/ingestion`) → aba **Descoberta ATS** → Fila:

1. Selecionar candidatos (checkbox por linha ou da página) → **Validar selecionados** / **Descartar selecionados**.
2. **Criar todas as fontes** pros validados.

## Opções do script

| Opção | Padrão | Uso |
|---|---|---|
| `--limit=N` | 500 | páginas novas baixadas nesta execução; `0` = não baixa nada |
| `--apply` | — | grava os candidatos novos; sem ele é dry-run |
| `--sitemap-pages=N` | 1 | quantas páginas do sitemap ler (da mais recente pra mais antiga). Não aumentar sem motivo: o sitemap tem dezenas de páginas e as antigas são vaga encerrada |
| `--delay-ms=N` | 700 | pausa entre requisições ao beBee |
| `--origins=t7xk,fj` | t7xk,fj | feeds considerados (TheirStack, Fantastic Jobs) |
| `--report=caminho.csv` | `.cache/bebee-discovery/report-<data>.csv` | onde gravar o relatório |

## Onde ficam os arquivos

- Cache: `apps/api/.cache/bebee-discovery/pages.jsonl` (gitignored, só na máquina local — não apagar, é ele que evita rebaixar tudo).
- Relatórios e log: mesma pasta.

## Cuidados

- Nunca rodar o download contra produção nem no servidor: é lento e bate no site do beBee.
- Não colar a URL do banco de produção em chat/issue; se vazar, trocar a senha no Railway.
- O sitemap BR também traz algumas vagas de fora do Brasil (ex.: Itália). Se alguma virar candidato, descartar na validação.
