# Handoff — Bug: Seções vazias no CV adaptado (CERTIFICAÇÕES / IDIOMAS)

## Problema reportado
Ao baixar o PDF do CV adaptado, seções sem dados (ex: IDIOMAS quando o CV base não tem idiomas, CERTIFICAÇÕES quando não há certificações) aparecem como cabeçalhos vazios. Além disso, items de certificações e formações aparecem erroneamente dentro da seção EDUCAÇÃO com vírgula no final.

## Diagnóstico completo

### O que foi investigado

1. **Prompt da IA** — adicionadas regras 26–29 explicitando que seções sem dados não devem ser geradas. Não resolveu — a IA ignora ocasionalmente.

2. **packages/ai/src/cv-adaptation.ts — `adaptCv`** — adicionado filtro após `JSON.parse` para remover seções sem conteúdo real antes de armazenar. Funciona para novas adaptações, mas não cobre dados já cacheados no banco.

3. **api/cv-adaptation.service.ts — `toCvAdaptationOutput`** — adicionado `filterEmptySections` aplicado sobre `aiAuditJson` e `adaptedContentJson` antes de retornar. Verificado via logs: o filtro roda e retorna 4 seções limpas.

4. **api/cv-adaptation-pdf.service.ts** — adicionado `sectionHasContent` em `buildSectionsHtml` e `injectIntoTemplateHtml`. Funciona, mas **nunca é chamado** para este caso porque o PDF é gerado via DOCX.

### ROOT CAUSE CONFIRMADO

O PDF é gerado pelo caminho **DOCX** (não HTML), verificado porque os logs de `buildSectionsHtml` e `injectIntoTemplateHtml` **nunca apareceram**, enquanto `toCvAdaptationOutput` logou dados limpos (4 seções sem IDIOMAS/CERTIFICAÇÕES).

Fluxo DOCX no `downloadPdf`:
```
resolvedTemplateFileUrl?.endsWith(".docx") === true
→ docxService.generateDocx(output, resolvedTemplateFileUrl)
→ mapOutputToTemplateData(output)
→ templateDocx.fillFromStorage(templateFileUrl, data)
→ docxService.toPdf(docxBuffer)
```

Em `mapOutputToTemplateData`:
```typescript
const certSection = output.sections?.find(s => s.sectionType === "certifications");
const langSection = output.sections?.find(s => s.sectionType === "languages");

return {
  certificacoes: this.mapCourseItems(certSection),  // → [] quando filtrado
  idiomas: this.mapLanguages(langSection),           // → [] quando filtrado
};
```

O template DOCX tem os cabeçalhos **fora do loop**:
```
CERTIFICAÇÕES        ← cabeçalho fixo, sempre renderiza
{#certificacoes}
{courseName} ...
{/certificacoes}

IDIOMAS              ← cabeçalho fixo, sempre renderiza
{#idiomas}
{language} ...
{/idiomas}
```

Resultado: mesmo com `certificacoes: []` e `idiomas: []`, os cabeçalhos aparecem no PDF.

### Por que `toCvAdaptationOutput` retorna dados limpos mas o PDF tem lixo?

O `toCvAdaptationOutput` usa o `aiAuditJson` cacheado que foi gerado por uma chamada anterior a `buildPaidCvOutputFromGuest → adaptCv`. Esse output pode não ter seção `certifications` (a IA combinou em "Formação e Certificações" com sectionType "education"). Então `certSection === undefined` e `mapCourseItems(undefined) === []`. O template renderiza CERTIFICAÇÕES vazio.

## O que já está feito (commit 3514035)

- Filtro em `adaptCv` (AI package) — impede armazenar seções vazias em novas adaptações
- `filterEmptySections` em `toCvAdaptationOutput` — cobre dados antigos no banco  
- `sectionHasContent` no PDF service — cobre caminho HTML (não usado neste bug mas defesa em profundidade)
- Regras 26–29 no prompt da IA
- Regras de análise para datas ausentes em certificações/formação e CV > 2 páginas

## O que falta resolver

### Fix principal: DOCX template ou `mapOutputToTemplateData`

**Opção A (recomendada): Flags booleanas + atualizar template DOCX**

Em `mapOutputToTemplateData`, adicionar:
```typescript
return {
  ...
  hasCertificacoes: (certItems.length > 0),
  hasIdiomas: (langItems.length > 0),
  certificacoes: certItems,
  idiomas: langItems,
};
```

No template DOCX, envolver cabeçalhos nos condicionais:
```
{#hasCertificacoes}
CERTIFICAÇÕES
{#certificacoes}...{/certificacoes}
{/hasCertificacoes}

{#hasIdiomas}
IDIOMAS
{#idiomas}...{/idiomas}
{/hasIdiomas}
```

**Opção B (mais simples, sem alterar template): Forçar caminho HTML para PDF**

No `downloadPdf`, ignorar DOCX template e sempre usar `pdfService.generatePdf`. DOCX template fica apenas para `downloadDocx`.

**Opção C (workaround): Adicionar filtro no `buildFallbackDocx`**

```typescript
private buildFallbackDocx(output: CvAdaptationOutput): Buffer {
  const lines: string[] = [output.summary ?? ""];
  for (const section of output.sections ?? []) {
    if (section.sectionType === "header") continue;
    if (!section.items?.length) continue;  // ← filtro
    lines.push(`\n${section.title.toUpperCase()}`);
    ...
  }
}
```

Mas `buildFallbackDocx` só é chamado quando NÃO há template `.docx` — não cobre o caso principal.

## Arquivos relevantes

| Arquivo | Relevância |
|---|---|
| `packages/ai/src/cv-adaptation.ts` | `adaptCv` — filtra seções após parse; `SYSTEM_PROMPT` — regras 26–29 |
| `apps/api/src/cv-adaptation/cv-adaptation.service.ts` | `filterEmptySections`, `toCvAdaptationOutput`, `downloadPdf` (linha ~680) |
| `apps/api/src/cv-adaptation/cv-adaptation-pdf.service.ts` | `sectionHasContent`, `buildSectionsHtml` |
| `apps/api/src/cv-adaptation/cv-adaptation-docx.service.ts` | `mapOutputToTemplateData`, `mapLanguages`, `mapCourseItems` — ROOT CAUSE |
| Template DOCX | Armazenado no banco (`resumeTemplate.fileUrl`) — cabeçalhos fora de loop |

## Contexto adicional

- Branch: `main` (local e remoto sincronizados, commit 3514035)
- A IA pode gerar seções com `sectionType: "education"` que combinam educação + certificações em uma seção só (título "Formação e Certificações"). Nesse caso `certSection === undefined` e o DOCX template renderiza CERTIFICAÇÕES vazio.
- O fluxo tem duas chamadas à IA: (1) durante análise via `analyzeAndAdapt`, (2) durante primeiro download via `buildPaidCvOutputFromGuest`. O output de (2) é cacheado em `aiAuditJson` e reutilizado.
