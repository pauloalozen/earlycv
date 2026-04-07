# Spec: Fluxo de Templates Admin + Correção do Spinner

**Data:** 2026-04-07
**Status:** Aguardando implementação
**Implementador alvo:** Modelo menor (Haiku)

---

## 1. Contexto e objetivo

Esta spec cobre dois grupos de trabalho:

**A — Correção de bugs críticos** (implementar primeiro):
- Spinner "Gerando PDF..." trava forever na página `/resultado` após pagamento.
- Causa: polling para quando `status === "paid"`; o delivery roda async mas o frontend nunca descobre que virou `"delivered"`.

**B — Novo fluxo de templates baseado em PDF**:
- Admin faz upload do template em PDF (ex: templates do Canva, Adobe Express, etc.)
- Sistema extrai o design via GPT-4 Vision → gera HTML/CSS fiel
- Sistema tira screenshot do HTML → salva PNG de preview
- Usuário vê cards visuais com PNG ao escolher template em `/adaptar`
- CV adaptado é gerado injetando dados do candidato no HTML → Puppeteer → PDF
- Após pagamento: download em PDF e DOCX

---

## 2. Premissa central — fidelidade de formatação

> **O template deve ser respeitado ao máximo: fontes, tamanhos, margens, espaçamentos,
> cores, separadores, alinhamentos.**

### 2.1 Por que PDF é diferente de DOCX para este problema

PDFs de design (Canva, Adobe Express, Freepik) são documentos vetoriais com texto em
posições absolutas. Não possuem campos editáveis (AcroForm). Não é possível "preencher"
esses arquivos com dados do candidato diretamente.

### 2.2 Abordagem adotada: GPT-4 Vision → HTML → Puppeteer

O único caminho automático e viável com PDFs de design é:

```
PDF do template
      │
      ▼
Puppeteer converte página 1 → PNG
      │
      ├──→ Salva PNG como previewImageUrl (preview fiel para o usuário escolher)
      │
      └──→ GPT-4 Vision analisa o PNG
                  │
                  ▼
            Gera HTML/CSS que replica o design
            (fontes, cores, margens, separadores, layout)
                  │
                  └──→ Salva HTML em structureJson.templateHtml
                              │
                              ▼
                  Na geração do CV adaptado:
                  injeta dados do candidato no HTML
                              │
                              ▼
                        Puppeteer → PDF entregue ao usuário
```

### 2.3 Limitações honestas desta abordagem

| Elemento | Fidelidade esperada | Observação |
|---|---|---|
| Layout, proporções, margens | Alta (85-95%) | Puppeteer usa o mesmo motor de renderização (Blink) |
| Cores exatas | Alta | AI extrai hex do PNG |
| Tamanhos de fonte e pesos | Alta | AI identifica visualmente |
| Espaçamentos entre seções | Média-alta | AI aproxima; pode precisar de ajuste manual |
| Fontes proprietárias embedadas | Baixa | Substituídas pela Google Font visualmente mais próxima |
| Fontes Google Fonts / web-safe | Alta | AI identifica e especifica corretamente |
| Elementos gráficos simples (linhas, barras) | Alta | Replicados com CSS border/background |
| Elementos gráficos complexos (ícones vetoriais, formas) | Média | Substituídos por equivalentes CSS ou omitidos |

**Para templates limpos e minimalistas (single-column, fontes web-safe, separadores simples)
— como o exemplo "Black and White Minimalist" — a fidelidade será alta.**

Templates com colunas múltiplas, fontes proprietárias embedadas ou elementos gráficos
elaborados terão fidelidade menor e podem exigir ajuste manual do HTML pelo admin
(funcionalidade futura: editor de HTML no painel admin).

---

## 3. Bug A — Polling incompleto na página de resultado

### 3.1 Root cause

`apps/web/src/app/adaptar/[id]/resultado/page.tsx` faz polling a cada 3 segundos
**apenas quando** `data.status === "analyzing"`.

Fluxo com bug:
1. `/confirmacao` chama `POST /cv-adaptation/:id/confirm-payment`
2. API atualiza status → `"paid"` e dispara `deliverAdaptation` (async, fire-and-forget)
3. Frontend redireciona para `/resultado`
4. `resultado` busca o estado → vê `"paid"` → exibe "Gerando PDF..."
5. **Polling não é disparado** → tela congela mesmo que o delivery complete

### 3.2 Correção

Arquivo: `apps/web/src/app/adaptar/[id]/resultado/page.tsx`

```typescript
// Antes
if (data.status === "analyzing") {
  setTimeout(fetchAdaptation, 3000);
}

// Depois
if (data.status === "analyzing" || data.status === "paid") {
  setTimeout(fetchAdaptation, 3000);
}
```

---

## 4. Schema — nenhuma migração necessária

`ResumeTemplate` já possui todos os campos necessários:

| Campo | Uso neste fluxo |
|---|---|
| `fileUrl` | URL do PDF original enviado pelo admin |
| `previewImageUrl` | URL do PNG gerado (screenshot do HTML renderizado) |
| `structureJson` | `{ templateHtml: string }` — HTML gerado pelo GPT-4 Vision |
| `slug` | Identificador para fallback se templateHtml não existir |

---

## 5. Prompt GPT-4 Vision para geração do HTML

Este prompt é a peça central da abordagem. Deve ser minucioso para maximizar fidelidade.

```
System:
Você é um especialista em replicação de designs de CV em HTML/CSS puro.
Sua tarefa é analisar a imagem de um template de currículo e gerar um HTML completo
que replique fielmente o design visual.

Regras absolutas de output:
- Retorne APENAS o HTML completo, começando com <!DOCTYPE html>. Sem markdown, sem explicações.
- Todo CSS deve ser inline ou em <style> no <head>. Sem dependências externas exceto Google Fonts.
- Se identificar uma Google Font no design, inclua o @import dela no <style>.
- Se a fonte for proprietária/desconhecida, use a Google Font visualmente mais próxima.

Regras de fidelidade visual (respeitar exatamente):
- Margens da página: medir visualmente e especificar em mm ou px
- Tamanhos de fonte: especificar em pt ou px com os valores exatos identificados
- Pesos de fonte: bold, semibold (600), normal — conforme visto no design
- Cores: extrair os hex exatos de cada elemento (texto, fundo, bordas, decorações)
- Espaçamento entre seções (margin-top, padding): aproximar com cuidado
- Alinhamentos: centralizado, esquerda, direita — conforme o design
- Separadores/linhas: replicar com border, hr ou background-color
- Elementos decorativos (barras, caixas): replicar com CSS, sem imagens

Regras para compatibilidade com Puppeteer (PDF gerado via Chrome headless):
- Usar @page { size: A4; margin: 0; } no CSS
- O body deve ter width: 210mm
- Sem position: fixed ou position: absolute para conteúdo de texto
- Imagens: não incluir (substituir ícones por texto ou caracteres unicode equivalentes)

Placeholders obrigatórios (inserir exatamente onde o conteúdo correspondente aparece):
- {{candidateName}} — nome do candidato (substituir o nome de exemplo)
- {{jobTitle}} — cargo/título profissional
- {{contactLine}} — linha de contato (email | telefone | endereço)
- {{summary}} — parágrafo de resumo/objetivo
- {{sectionsHtml}} — HTML das seções de conteúdo (gerado separadamente; inserir como bloco)

O HTML gerado deve ter dados de exemplo (do template original) preenchidos EXCETO
onde os placeholders são inseridos. Isso permite visualizar o resultado antes de injetar
dados reais.

User:
Analise este template de currículo e gere o HTML/CSS que replica fielmente o design.
[imagem PNG do template]
```

### 5.1 Geração do `sectionsHtml`

O `{{sectionsHtml}}` é gerado programaticamente pelo `CvAdaptationPdfService`
a partir dos dados do candidato, usando o mesmo padrão de HTML/CSS do template.

Para gerar o `sectionsHtml` fiel ao template, o prompt deve incluir um segundo passo:
após gerar o HTML base, solicitar também os "snippets" de seção reutilizáveis:

```
Adicionalmente, gere os seguintes fragmentos HTML para uso no preenchimento:
1. sectionHeader: HTML de um título de seção (ex: "WORK EXPERIENCE" com sua linha divisória)
   Use o placeholder {{sectionTitle}}
2. sectionItem: HTML de um item de seção (cargo, empresa, data, descrição)
   Use os placeholders {{heading}}, {{subheading}}, {{dateRange}}, {{bullets}}
3. bulletItem: HTML de um bullet point individual. Use {{bulletText}}

Retorne os fragmentos após o HTML principal, separados por:
---SECTION_HEADER---
[fragmento sectionHeader]
---SECTION_ITEM---
[fragmento sectionItem]
---BULLET_ITEM---
[fragmento bulletItem]
```

Estes fragmentos são salvos junto com o `templateHtml` em `structureJson`:

```json
{
  "templateHtml": "<!DOCTYPE html>...",
  "sectionHeaderHtml": "<div class=\"section-title\">{{sectionTitle}}</div><hr/>",
  "sectionItemHtml": "<div class=\"item\">...</div>",
  "bulletItemHtml": "<li>{{bulletText}}</li>"
}
```

---

## 6. Backend — `ResumeTemplateGeneratorService`

Criar: `apps/api/src/resume-templates/resume-template-generator.service.ts`

### 6.1 Interface pública

```typescript
@Injectable()
export class ResumeTemplateGeneratorService {
  async generateFromPdf(
    pdfBuffer: Buffer,
    templateId: string,
  ): Promise<{
    previewImageUrl: string;
    templateHtml: string;
    sectionHeaderHtml: string;
    sectionItemHtml: string;
    bulletItemHtml: string;
  }>
}
```

### 6.2 Implementação passo a passo

**Passo 1 — PDF → PNG via Puppeteer**

```typescript
private async pdfToImage(pdfBuffer: Buffer): Promise<Buffer> {
  // Escrever PDF em arquivo temp
  const tmpPdf = `/tmp/${randomUUID()}.pdf`;
  writeFileSync(tmpPdf, pdfBuffer);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });

  try {
    const page = await browser.newPage();
    await page.goto(`file://${tmpPdf}`, { waitUntil: 'networkidle0' });
    await page.setViewport({ width: 794, height: 1123 }); // A4 @ 96dpi

    const png = await page.screenshot({ type: 'png', fullPage: false });
    return Buffer.from(png);
  } finally {
    await browser.close();
    unlinkSync(tmpPdf);
  }
}
```

**Passo 2 — PNG → GPT-4 Vision → HTML + fragmentos**

```typescript
private async generateHtmlFromImage(pngBuffer: Buffer): Promise<{
  templateHtml: string;
  sectionHeaderHtml: string;
  sectionItemHtml: string;
  bulletItemHtml: string;
}> {
  const base64 = pngBuffer.toString('base64');

  const response = await this.aiClient.chat.completions.create({
    model: 'gpt-4o',          // Vision — não usar gpt-4o-mini aqui, precisa de visão precisa
    max_tokens: 4096,
    messages: [
      { role: 'system', content: TEMPLATE_GENERATION_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' },
          },
          {
            type: 'text',
            text: 'Analise este template de currículo e gere o HTML/CSS conforme as instruções.',
          },
        ],
      },
    ],
  });

  const raw = response.choices[0].message.content ?? '';
  return this.parseGeneratedHtml(raw);
}

private parseGeneratedHtml(raw: string): { templateHtml, sectionHeaderHtml, sectionItemHtml, bulletItemHtml } {
  const parts = raw.split(/---(?:SECTION_HEADER|SECTION_ITEM|BULLET_ITEM)---/);
  return {
    templateHtml: parts[0]?.trim() ?? '',
    sectionHeaderHtml: parts[1]?.trim() ?? '<div><strong>{{sectionTitle}}</strong><hr/></div>',
    sectionItemHtml: parts[2]?.trim() ?? '<div>{{heading}} | {{subheading}} | {{dateRange}}</div>',
    bulletItemHtml: parts[3]?.trim() ?? '<li>{{bulletText}}</li>',
  };
}
```

**Passo 3 — HTML → PNG de preview (screenshot do template renderizado)**

```typescript
private async screenshotHtml(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const png = await page.screenshot({ type: 'png', fullPage: false });
    return Buffer.from(png);
  } finally {
    await browser.close();
  }
}
```

**Orquestrador:**

```typescript
async generateFromPdf(pdfBuffer: Buffer, templateId: string) {
  // 1. PDF → PNG para enviar ao Vision
  const templatePng = await this.pdfToImage(pdfBuffer);

  // 2. Vision → HTML + fragmentos
  const { templateHtml, sectionHeaderHtml, sectionItemHtml, bulletItemHtml } =
    await this.generateHtmlFromImage(templatePng);

  // 3. Screenshot do HTML gerado (preview fiel para o usuário)
  const previewPng = await this.screenshotHtml(templateHtml);

  // 4. Upload preview PNG para MinIO
  const previewKey = `templates/${templateId}/preview.png`;
  const previewImageUrl = await this.storage.putObject(previewKey, previewPng, 'image/png');

  return { previewImageUrl, templateHtml, sectionHeaderHtml, sectionItemHtml, bulletItemHtml };
}
```

### 6.3 Atualizar `ResumeTemplatesService.uploadFile`

```typescript
async uploadFile(templateId, file) {
  // ... upload do arquivo original para MinIO (código existente) ...

  try {
    const { previewImageUrl, templateHtml, sectionHeaderHtml, sectionItemHtml, bulletItemHtml } =
      await this.generator.generateFromPdf(file.buffer, templateId);

    return this.database.resumeTemplate.update({
      where: { id: templateId },
      data: {
        fileUrl: url,
        previewImageUrl,
        structureJson: { templateHtml, sectionHeaderHtml, sectionItemHtml, bulletItemHtml },
      },
    });
  } catch (err) {
    // Fallback: salva o arquivo mas não atualiza preview/HTML
    // Admin verá placeholder cinza e poderá tentar novamente
    this.logger.error(`Template generation failed for ${templateId}: ${err.message}`);
    return this.database.resumeTemplate.update({
      where: { id: templateId },
      data: { fileUrl: url },
    });
  }
}
```

---

## 7. Backend — geração do CV adaptado com template

### 7.1 `CvAdaptationPdfService` — injeção de dados no HTML do template

O `structureJson` do template já possui `templateHtml`, `sectionHeaderHtml`,
`sectionItemHtml` e `bulletItemHtml`. O PDF service usa esses fragmentos para
construir o HTML final com os dados do candidato.

```typescript
async generatePdf(
  output: CvAdaptationOutput,
  structureJson: Record<string, string> | null,
): Promise<Buffer> {
  const html = structureJson?.templateHtml
    ? this.injectDataIntoTemplate(output, structureJson)
    : this.buildFallbackHtml(output);   // fallback genérico existente

  // ... Puppeteer gera PDF (código existente) ...
}

private injectDataIntoTemplate(
  output: CvAdaptationOutput,
  structureJson: Record<string, string>,
): string {
  const { templateHtml, sectionHeaderHtml, sectionItemHtml, bulletItemHtml } = structureJson;

  const header = output.sections?.find(s => s.sectionType === 'header');
  const contentSections = output.sections?.filter(s => s.sectionType !== 'header') ?? [];

  const candidateName = header?.items?.[0]?.heading ?? '';
  const jobTitle = '';   // extrair do adaptation se disponível
  const contactLine = (header?.items?.[0]?.bullets ?? []).join(' | ');
  const summary = output.summary ?? '';

  // Montar sectionsHtml usando os fragmentos do template
  const sectionsHtml = contentSections.map(section => {
    const itemsHtml = (section.items ?? []).map(item => {
      const bulletsHtml = (item.bullets ?? [])
        .map(b => (bulletItemHtml ?? '<li>{{bulletText}}</li>').replace('{{bulletText}}', this.escapeHtml(b)))
        .join('');

      return (sectionItemHtml ?? '')
        .replace('{{heading}}', this.escapeHtml(item.heading ?? ''))
        .replace('{{subheading}}', this.escapeHtml(item.subheading ?? ''))
        .replace('{{dateRange}}', this.escapeHtml(item.dateRange ?? ''))
        .replace('{{bullets}}', bulletsHtml);
    }).join('');

    return (sectionHeaderHtml ?? '')
      .replace('{{sectionTitle}}', this.escapeHtml(section.title))
      + itemsHtml;
  }).join('');

  return templateHtml
    .replace('{{candidateName}}', this.escapeHtml(candidateName))
    .replace('{{jobTitle}}', this.escapeHtml(jobTitle))
    .replace('{{contactLine}}', this.escapeHtml(contactLine))
    .replace('{{summary}}', this.escapeHtml(summary))
    .replace('{{sectionsHtml}}', sectionsHtml);
}
```

### 7.2 `deliverAdaptation` — salvar os arquivos gerados

O PDF e DOCX gerados devem ser **salvos no MinIO** e servidos no download,
não regenerados a cada request.

```typescript
private async deliverAdaptation(adaptationId: string): Promise<void> {
  const adaptation = await this.database.cvAdaptation.findUnique({
    where: { id: adaptationId },
    include: { masterResume: true, template: true },
  });

  const output = adaptation.adaptedContentJson as CvAdaptationOutput;
  const structureJson = adaptation.template?.structureJson as Record<string, string> | null;
  const templateSlug = adaptation.template?.slug ?? 'classico-simples';

  // Gerar PDF
  const pdfBuffer = await this.pdfService.generatePdf(output, structureJson);

  // Gerar DOCX (com estilo aproximado do template)
  const docxBuffer = await this.docxService.generateDocx(output, templateSlug);

  // Salvar ambos no MinIO
  const pdfKey = `adaptations/${adaptationId}/cv-adaptado.pdf`;
  const docxKey = `adaptations/${adaptationId}/cv-adaptado.docx`;
  const [pdfUrl, docxUrl] = await Promise.all([
    this.storage.putObject(pdfKey, pdfBuffer, 'application/pdf'),
    this.storage.putObject(docxKey, docxBuffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  ]);

  // Criar Resume adaptado e atualizar adaptation
  const adaptedResume = await this.database.resume.create({
    data: { /* ... campos existentes ... */ },
  });

  await this.database.cvAdaptation.update({
    where: { id: adaptationId },
    data: {
      adaptedResumeId: adaptedResume.id,
      status: 'delivered',
      structureJson: { pdfUrl, docxUrl } as unknown as Prisma.InputJsonValue,
    },
  });
}
```

### 7.3 Download — servir arquivo salvo

`downloadPdf` e `downloadDocx` lêem as URLs de `structureJson` e servem o arquivo
já gerado, sem regenerar:

```typescript
async downloadPdf(userId: string, id: string, res: Response): Promise<void> {
  const adaptation = await this.database.cvAdaptation.findFirst({
    where: { id, userId },
  });

  // ... validações (paymentStatus, adaptedResumeId) ...

  const json = adaptation.structureJson as { pdfUrl?: string } | null;
  if (!json?.pdfUrl) {
    throw new BadRequestException('PDF not yet generated.');
  }

  const key = this.extractKeyFromUrl(json.pdfUrl);
  const pdfBuffer = await this.storage.getObject(key);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=cv-adaptado.pdf');
  res.send(pdfBuffer);
}
```

Mesmo padrão para `downloadDocx` usando `json.docxUrl`.

---

## 8. StorageService — adicionar método `getObject`

O `StorageService` existente provavelmente só tem `putObject` e `deleteObject`.
Adicionar `getObject`:

```typescript
async getObject(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
  const response = await this.s3.send(command);
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
```

---

## 9. Frontend admin — feedback no upload

Arquivo: `apps/web/src/app/admin/templates/[id]/page.tsx`

Após upload do arquivo com sucesso:
- Se `template.previewImageUrl` foi preenchido: exibir preview PNG gerado com `<Image>`
- Exibir: "Preview gerado automaticamente a partir do PDF."
- Se `previewImageUrl` ainda nulo após upload (geração falhou): exibir aviso em amarelo:
  "Arquivo salvo, mas a geração do preview falhou. Certifique-se de que o PDF é legível e tente novamente."

---

## 10. Ordem de implementação

1. **[Bug fix]** Corrigir polling em `resultado/page.tsx` — adicionar `"paid"` à condição
2. **[Backend]** Adicionar `getObject` ao `StorageService`
3. **[Backend]** Criar `ResumeTemplateGeneratorService` com os 4 métodos
4. **[Backend]** Registrar o service em `ResumeTemplatesModule`
5. **[Backend]** Atualizar `ResumeTemplatesService.uploadFile` para chamar o generator
6. **[Backend]** Atualizar `CvAdaptationPdfService.generatePdf` para aceitar `structureJson`
7. **[Backend]** Reescrever `deliverAdaptation`: salvar PDF e DOCX no MinIO
8. **[Backend]** Reescrever `downloadPdf` e `downloadDocx`: servir arquivos salvos
9. **[Frontend]** Atualizar página admin de template para exibir preview PNG
10. **[Testes]** Upload de PDF → ver preview → adaptar CV → pagar → baixar PDF e DOCX

---

## 11. Arquivos impactados

| Arquivo | Ação |
|---|---|
| `apps/web/src/app/adaptar/[id]/resultado/page.tsx` | Bug fix: polling para status `"paid"` |
| `apps/api/src/storage/storage.service.ts` | Adicionar `getObject` |
| `apps/api/src/resume-templates/resume-template-generator.service.ts` | Criar |
| `apps/api/src/resume-templates/resume-templates.module.ts` | Registrar generator |
| `apps/api/src/resume-templates/resume-templates.service.ts` | Chamar generator no `uploadFile` |
| `apps/api/src/cv-adaptation/cv-adaptation-pdf.service.ts` | Aceitar `structureJson`, injetar fragmentos |
| `apps/api/src/cv-adaptation/cv-adaptation.service.ts` | `deliverAdaptation`, `downloadPdf`, `downloadDocx` |
| `apps/web/src/app/admin/templates/[id]/page.tsx` | Exibir preview PNG após upload |

---

## 12. Dependências

Nenhuma dependência nova. Tudo já está instalado:
- `puppeteer` — para PDF→PNG e HTML→PDF
- `openai` — para GPT-4 Vision
- `@aws-sdk/client-s3` — para MinIO

---

## 13. Restrições e decisões

- **`gpt-4o` (não `gpt-4o-mini`)** para geração do HTML — Vision com `detail: "high"` exige capacidade máxima. Usar `gpt-4o-mini` para esta tarefa gerará HTML de baixa fidelidade.
- **Upload aceita apenas PDF** neste fluxo. DOCX pode ser suportado no futuro.
- **Não existe edição manual de HTML no painel admin no MVP** — se o template gerado não for satisfatório, o admin faz upload de um PDF diferente (melhor resolução, design mais simples).
- **DOCX gerado** (`cv-adaptado.docx`) usa o `CvAdaptationDocxService` existente com estilo aproximado — não replica o design do template com fidelidade. Fidelidade total no DOCX exigiria template DOCX, que está fora do escopo.
- **O PDF gerado** é o entregável principal com fidelidade visual ao template.
- **Os arquivos gerados são salvos no MinIO** e não regenerados a cada download — isso é obrigatório pois Puppeteer + Vision são caros computacionalmente.
