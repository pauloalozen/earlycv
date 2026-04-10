# Memoria de implementacao — Dashboard e CV Master

Data: 2026-04-10

## Decisoes

- Dashboard principal usa CTA unico para analise de vaga (evita competicao de acoes).
- Card CV Master fica imediatamente abaixo do CTA para reduzir friccao de uso recorrente.
- Integracao de CV Master no `/adaptar` reaproveita API existente (`POST /cv-adaptation` com `masterResumeId`).
- Sem CV Master, fluxo de upload continua padrao e obrigatorio.

## Regras de UX mantidas

- Estilo clean existente preservado.
- Sem novas paginas para CV Master.
- Historico manteve foco em `Rever analise`, `Baixar PDF`, `Baixar DOCX`.
