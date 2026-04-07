# Spec: Template-Based CV Rendering + DOCX Export

**Data:** 2026-04-06  
**Status:** Aguardando aprovação  
**Implementador alvo:** Modelo menor (Haiku)

---

## 1. Contexto e objetivo

Hoje o PDF gerado ignora o template selecionado e usa um layout genérico pdfkit.
O objetivo desta entrega é:

1. Gerar o PDF adaptado **idêntico ao design do template** escolhido pelo usuário
2. Oferecer download em **DOCX** (editável) além do PDF
3. Exibir **preview visual** dos templates na tela de seleção (`/adaptar`)
4. Suportar **3 templates iniciais** com designs distintos

---

## 2. ATS Compatibility — regra não negociável

ATS (Applicant Tracking System) são os sistemas que empresas usam para filtrar CVs antes de um humano ler.
A proposta de valor do EarlyCV é **passar no filtro ATS**. Todas as decisões de design e geração de arquivo devem respeitar as regras abaixo.

### 2.1 Regras para PDF (Puppeteer)

| Regra | Motivo |
|---|---|
| Todo texto deve ser **selecionável** (não imagem) | ATS parseia texto, não OCR |
| **Sem colunas CSS** (`column-count`, `display: grid` com múltiplas colunas) | ATS lê o HTML linearmente; colunas embaralham a ordem lógica |
| **Sem tabelas** para layout | Parsers quebram ao encontrar `<table>` fora de contexto tabular |
| **Sem cabeçalho/rodapé** HTML (`<header>`, `<footer>` com posição fixed/absolute) | Alguns ATS ignoram conteúdo fora do fluxo principal |
| **Sem ícones, imagens ou SVGs** dentro do corpo do CV | ATS não interpreta imagens |
| Fontes: **Arial, Helvetica, Times New Roman, Calibri** (web-safe) | Fontes externas podem não embedar corretamente |
| Seções com títulos **padrão do mercado** (Experience, Education, Skills — em inglês; ou equivalentes PT-BR) | ATS reconhece seções por nome |
| **Sem caixas de texto** com `position: absolute` | Texto fora do fluxo é ignorado por muitos parsers |
| Bullets com caractere simples (`•` U+2022 ou `-`) | Bullets especiais podem virar lixo no parse |

### 2.2 Regras para DOCX (docx library)

| Regra | Motivo |
|---|---|
| **Sem TextBox** (`TextRun` em floating frames) | ATS ignora texto fora do fluxo |
| **Sem tabelas para layout** (só para dados tabulares reais) | Quebra o parsing linear |
| Usar apenas **Paragraph + Run** para todo o conteúdo | Estrutura mais simples e mais compatível |
| Heading styles padrão Word (`Heading1`, `Heading2`) para seções | ATS usa estilos para identificar seções |
| **Sem cabeçalho/rodapé Word** (`Header`/`Footer` sections) | Alguns ATS não leem essas áreas |
| Ordem do documento: contato → summary → experiência → educação → skills | Ordem esperada pelo parser |
| Fonte padrão: **Calibri 11pt** para corpo, **Calibri 14pt** para nome | Padrão Word, máxima compatibilidade |

### 2.3 Impacto no design dos templates

- **`classico-simples`**: single-column puro → 100% ATS safe
- **`moderno-lateral`**: o design two-column **visual** deve ser implementado com `display: flex` no HTML, mas a **ordem do DOM** deve ser linear (contato e skills aparecem visualmente na coluna esquerda mas no DOM ficam após o conteúdo principal, e o PDF gerado pelo Puppeteer lê o DOM em ordem). **Solução:** no HTML do template moderno-lateral, manter o DOM em ordem lógica (contato no topo, depois experiência, depois educação, depois skills) e usar CSS para posicionamento visual sem alterar a ordem de leitura. Alternativamente, simplificar para single-column com sidebar apenas decorativa.
- **`executivo`**: single-column com faixa de cabeçalho — ATS safe desde que o texto do cabeçalho esteja no fluxo normal (não `position: absolute`)

---

## 3. Schema — nenhuma mudança necessária

O `ResumeTemplate` já possui:
- `slug` — identificador do template (ex: `classico-simples`)
- `previewImageUrl` — URL da imagem de preview
- `fileUrl` — PDF de referência do design (enviado pelo admin)
- `structureJson` — reservado para metadados do template

O `CvAdaptation` já possui `templateId` vinculado ao `ResumeTemplate`.

**Não há migrações de banco necessárias.**

---

## 4. Templates iniciais

Criar três templates com os seguintes slugs. O design HTML/CSS de cada um vive em:
`apps/api/src/cv-adaptation/templates/<slug>/template.html`

### 3.1 `classico-simples`
- Layout single-column
- Nome centralizado, grande (22pt), contato abaixo em linha separada por `|`
- Seções com título em MAIÚSCULO + linha divisória cinza
- Heading do item em negrito, subheading em itálico, dateRange alinhado à direita na mesma linha
- Bullets com `•`, indentados 12px
- Fonte: Helvetica / Arial
- Cor de destaque: nenhuma (preto e cinza apenas)

### 3.2 `moderno-lateral`
- Layout two-column: coluna esquerda (30%) para contato + skills, coluna direita (70%) para experiência + educação
- Nome no topo da coluna direita, grande
- Coluna esquerda com fundo cinza claro (`#f5f5f5`)
- Seções com título em cor de destaque (`#E25C1A` — laranja EarlyCV)
- Fonte: sans-serif
- Bullets: traço `–` ao invés de `•`

### 3.3 `executivo`
- Layout single-column com faixa de cabeçalho escura (`#1a1a2e`)
- Nome e contato sobre fundo escuro, texto branco
- Seções com título sublinhado em laranja (`#E25C1A`)
- Heading em negrito preto, dateRange em cinza médio
- Espaçamento generoso entre seções

---

## 4. Geração de PDF com Puppeteer

### 4.1 Instalação

```bash
npm install puppeteer --workspace @earlycv/api
```

Puppeteer baixa o Chromium automaticamente. Em produção, configurar
`PUPPETEER_EXECUTABLE_PATH` apontando para o Chrome/Chromium do sistema.

### 4.2 Estrutura de arquivos

```
apps/api/src/cv-adaptation/
  templates/
    classico-simples/
      template.html          ← HTML com placeholders {{variavel}}
    moderno-lateral/
      template.html
    executivo/
      template.html
  cv-adaptation-pdf.service.ts   ← substituir implementação atual
  cv-adaptation-docx.service.ts  ← novo
```

### 4.3 Mecanismo de template HTML

Cada `template.html` é um arquivo HTML completo com CSS inline (sem dependências externas).
Os dados do CV são injetados via substituição de placeholders antes de renderizar.

**Placeholders disponíveis:**

| Placeholder | Conteúdo |
|---|---|
| `{{candidateName}}` | Nome do candidato (heading da seção header) |
| `{{contactLine}}` | Bullets da seção header unidos por ` \| ` |
| `{{summary}}` | Texto do summary |
| `{{sectionsHtml}}` | HTML das seções de conteúdo (gerado pelo service) |
| `{{highlightedSkillsHtml}}` | HTML dos skills destacados |

### 4.4 Interface do `CvAdaptationPdfService`

```typescript
// apps/api/src/cv-adaptation/cv-adaptation-pdf.service.ts

@Injectable()
export class CvAdaptationPdfService {
  async generatePdf(
    output: CvAdaptationOutput,
    templateSlug: string,        // ex: "classico-simples"
  ): Promise<Buffer>
}
```

**Fluxo interno:**
1. Lê `apps/api/src/cv-adaptation/templates/<templateSlug>/template.html`
2. Extrai `header`, `summary`, `sections`, `highlightedSkills` do `output`
3. Gera o `sectionsHtml` iterando sobre as seções (exceto `header`)
4. Substitui os placeholders no HTML
5. Abre Puppeteer, navega para o HTML via `page.setContent(html)`
6. Chama `page.pdf({ format: "A4", printBackground: true })`
7. Fecha o browser e retorna o buffer

**Fallback:** se o `templateSlug` não tiver um template HTML correspondente, usa `classico-simples`.

---

## 5. Geração de DOCX

### 5.1 Instalação

```bash
npm install docx --workspace @earlycv/api
```

### 5.2 Interface

```typescript
// apps/api/src/cv-adaptation/cv-adaptation-docx.service.ts

@Injectable()
export class CvAdaptationDocxService {
  async generateDocx(
    output: CvAdaptationOutput,
    templateSlug: string,
  ): Promise<Buffer>
}
```

### 5.3 Implementação

Usar a biblioteca `docx` para gerar um `.docx` estruturado.
O template influencia apenas cores e estilos (HeadingStyle, accentColor).
A estrutura de seções é a mesma para todos os templates.

**Estrutura do documento:**
1. Parágrafo com nome do candidato (Heading 1, bold, centralizado para `classico-simples` e `executivo`, esquerda para `moderno-lateral`)
2. Parágrafo com linha de contato (Normal, centralizado, 9pt)
3. Parágrafo com summary (Normal, itálico, 10pt)
4. Para cada seção (excluindo `header`):
   - Título da seção (Heading 2, MAIÚSCULO, com cor de destaque do template)
   - Para cada item:
     - Heading do item (bold, 10pt) + dateRange (direita, 9pt, cinza) — usar tab para alinhar
     - Subheading (itálico, 9pt)
     - Bullets (Normal, 9pt, com `•`)
5. Seção de skills: parágrafo único com todos os skills separados por ` • `

**Cores por template:**

| Template | Cor de destaque (hex) |
|---|---|
| `classico-simples` | `#000000` |
| `moderno-lateral` | `#E25C1A` |
| `executivo` | `#E25C1A` |

---

## 6. Endpoints de download

### 6.1 Novos endpoints na API

```
GET /api/cv-adaptation/:id/download?format=pdf    (padrão, já existe)
GET /api/cv-adaptation/:id/download?format=docx   (novo)
```

O controller lê o query param `format` e chama o service correspondente.
Ambos exigem autenticação JWT e `paymentStatus = completed`.

Content-Type:
- PDF: `application/pdf`, filename `cv-adaptado.pdf`
- DOCX: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, filename `cv-adaptado.docx`

### 6.2 Rota proxy no Next.js (já existe para PDF)

Criar rota análoga para DOCX:
`apps/web/src/app/api/cv-adaptation/[id]/download/route.ts`

Aceitar query param `format` e repassar para a API, devolvendo o arquivo com o Content-Type correto.

---

## 7. Frontend — Preview de templates na tela `/adaptar`

### 7.1 Card de template

Substituir o radio button simples por um card visual:

```
┌─────────────────────────────┐
│  [imagem preview 160x220px] │
│  ───────────────────────    │
│  ● Clássico Simples         │
│  Clean, profissional        │
└─────────────────────────────┘
```

- Imagem: `template.previewImageUrl` (se nula, exibir placeholder cinza com ícone de documento)
- Border laranja quando selecionado
- Grid de 3 colunas em desktop, 1 coluna em mobile

### 7.2 Componente

Localização: `apps/web/src/app/adaptar/page.tsx`

O card é um `<label>` com `<input type="radio">` hidden, imagem e nome.
Comportamento atual de seleção mantido.

---

## 8. Frontend — Botões de download na tela `/adaptar/[id]/resultado`

Quando `adaptation.status === "delivered"`, exibir dois botões lado a lado:

```
[⬇ Baixar PDF]   [⬇ Baixar DOCX]
```

- PDF: link para `/api/cv-adaptation/{id}/download?format=pdf`
- DOCX: link para `/api/cv-adaptation/{id}/download?format=docx`
- Estilo: PDF em verde (`bg-green-600`), DOCX em azul (`bg-blue-600`)

Mesma lógica em `apps/web/src/app/meus-cvs/page.tsx` (adicionar botão DOCX ao lado do PDF).

---

## 9. Templates HTML — gerados no código, não pelo admin

Os 3 arquivos `template.html` são **criados pelo desenvolvedor** e vivem no repositório.
O admin **não** define nem sobe o design do template — isso é responsabilidade do código.

O que o admin faz na tela de templates:
- Sobe uma **imagem de preview** (screenshot PNG/JPG do template renderizado) para `previewImageUrl`
- Essa imagem é exibida ao usuário na tela `/adaptar` para ele escolher o template
- O `slug` do template no banco deve bater com o nome da pasta em `templates/<slug>/template.html`

Fluxo de adicionar um novo template:
1. Dev cria `apps/api/src/cv-adaptation/templates/<novo-slug>/template.html`
2. Dev tira screenshot do template renderizado e salva como PNG
3. Admin sobe o PNG no painel e cadastra o template com o mesmo slug

Adicionar campo `previewImageUrl` ao DTO de update do template na API admin.

---

## 10. Ordem de implementação sugerida

1. Instalar `puppeteer` e `docx`
2. Criar os 3 arquivos `template.html` (classico-simples, moderno-lateral, executivo)
3. Reescrever `CvAdaptationPdfService` usando Puppeteer + templates
4. Criar `CvAdaptationDocxService`
5. Atualizar `CvAdaptationModule` para registrar o novo service
6. Atualizar controller: query param `format` no endpoint download
7. Atualizar rota proxy Next.js para repassar `format`
8. Atualizar tela `/adaptar`: cards com preview image
9. Atualizar tela `/resultado` e `/meus-cvs`: botão DOCX
10. Atualizar admin templates: campo previewImageUrl

---

## 11. Arquivos impactados

| Arquivo | Ação |
|---|---|
| `apps/api/src/cv-adaptation/cv-adaptation-pdf.service.ts` | Reescrever |
| `apps/api/src/cv-adaptation/cv-adaptation-docx.service.ts` | Criar |
| `apps/api/src/cv-adaptation/cv-adaptation.module.ts` | Registrar DocxService |
| `apps/api/src/cv-adaptation/cv-adaptation.controller.ts` | Query param `format` |
| `apps/api/src/cv-adaptation/cv-adaptation.service.ts` | Chamar Docx ou Pdf por format |
| `apps/api/src/cv-adaptation/templates/classico-simples/template.html` | Criar |
| `apps/api/src/cv-adaptation/templates/moderno-lateral/template.html` | Criar |
| `apps/api/src/cv-adaptation/templates/executivo/template.html` | Criar |
| `apps/web/src/app/api/cv-adaptation/[id]/download/route.ts` | Adicionar `format` |
| `apps/web/src/app/adaptar/page.tsx` | Cards com preview |
| `apps/web/src/app/adaptar/[id]/resultado/page.tsx` | Botão DOCX |
| `apps/web/src/app/meus-cvs/page.tsx` | Botão DOCX |
| `apps/web/src/app/admin/templates/[id]/page.tsx` | Campo previewImageUrl |

---

## 12. Restrições e decisões

- Puppeteer roda no processo da API (não em worker separado). Para o MVP isso é aceitável.
- O Chromium baixado pelo Puppeteer (~170MB) não vai para o repositório (já no `.gitignore` via `node_modules`).
- Em produção, configurar `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser` e instalar o pacote no container.
- Os arquivos `template.html` são CSS inline para evitar dependências de arquivos externos ao renderizar via Puppeteer.
- O DOCX não replica o layout visual do template (isso é impossível com fidelidade total em Word), mas usa as cores e hierarquia de cada template.
