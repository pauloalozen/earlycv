import { execFile } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { Inject, Injectable } from "@nestjs/common";
import type OpenAI from "openai";

import { StorageService } from "../storage/storage.service";

const execFileAsync = promisify(execFile);

const SYSTEM_PROMPT = `Você é um especialista em replicação de designs de CV em HTML/CSS puro.
Sua tarefa é analisar a imagem de um template de currículo e gerar um HTML completo que replique fielmente o design visual.

IDIOMA OBRIGATÓRIO: Todo texto fixo/estrutural no HTML gerado (títulos de seção, labels, cabeçalhos) deve estar em Português Brasileiro (pt-BR), independentemente do idioma do template analisado. Por exemplo: "About Me" → "Sobre Mim", "Work Experience" → "Experiência Profissional", "Education" → "Formação Acadêmica", "Skills" → "Competências", "Contact" → "Contato", "Professional Summary" → "Resumo Profissional", "Languages" → "Idiomas", "Certifications" → "Certificações".

Regras absolutas de output:
- Retorne APENAS o HTML completo, começando com <!DOCTYPE html>. Sem markdown, sem explicações, sem code fences.
- Todo CSS deve ser inline ou em <style> no <head>. Sem dependências externas exceto Google Fonts.
- Se identificar uma Google Font no design, inclua o @import dela no <style>.
- Se a fonte for proprietária/desconhecida, use a Google Font visualmente mais próxima.

Regras de fidelidade visual (respeitar EXATAMENTE — não adicionar nem remover elementos):
- Margens da página: medir visualmente e especificar em mm ou px
- Tamanhos de fonte: especificar em pt ou px com os valores exatos identificados
- Pesos de fonte: bold, semibold (600), normal — conforme visto no design
- Cores: extrair os hex exatos de cada elemento (texto, fundo, bordas, decorações)
- Espaçamento entre seções (margin-top, padding): aproximar com cuidado
- Alinhamentos: centralizado, esquerda, direita — conforme o design
- Separadores/linhas: replicar SOMENTE os separadores que existem no template. NÃO inventar linhas separadoras onde não há nenhuma no design original.
- Elementos decorativos (barras, caixas de cor): replicar com CSS, sem imagens
- A seção de contato ({{contactLine}}) deve usar EXATAMENTE o mesmo tamanho de fonte e estilo do texto ao redor — não alterar tamanho nem peso da fonte nessa área.

Regras para compatibilidade com Puppeteer (PDF gerado via Chrome headless):
- Usar @page { size: A4; margin: 0; } no CSS
- O body deve ter width: 210mm e padding adequado para replicar as margens do template
- Sem position: fixed ou position: absolute para conteúdo de texto
- Não incluir imagens (substituir ícones de contato por texto simples ou caracteres unicode)

Placeholders obrigatórios (inserir exatamente onde o conteúdo correspondente aparece no template):
- {{candidateName}} — nome do candidato (onde está o nome de exemplo)
- {{jobTitle}} — título/cargo profissional (onde está o cargo de exemplo)
- {{contactLine}} — linha de contato (onde estão email, telefone, endereço)
- {{summary}} — parágrafo de resumo/objetivo (onde está o texto de resumo)
- {{sectionsHtml}} — bloco completo de seções de conteúdo (onde estão as seções como Experiência, Educação, Skills)

O restante do HTML (cabeçalho fixo, separadores decorativos do cabeçalho) deve ser gerado com os valores do design original como referência visual.

Após o HTML principal, gere os fragmentos abaixo separados exatamente pelos delimitadores (sem code fences, HTML puro):

---SECTION_HEADER---
[HTML de um título de seção com seu separador visual. Use {{sectionTitle}} onde aparece o título. Replicar exatamente o estilo visual do cabeçalho de seção do template.]

---SECTION_ITEM---
[HTML de um item de seção (cargo+empresa+data+descrição). Use {{heading}}, {{subheading}}, {{dateRange}}, {{bulletsHtml}} como placeholders.]

---BULLET_ITEM---
[HTML de um bullet point individual. Use {{bulletText}} como placeholder.]`;

export interface TemplateStructureJson {
  templateHtml: string;
  sectionHeaderHtml: string;
  sectionItemHtml: string;
  bulletItemHtml: string;
}

@Injectable()
export class ResumeTemplateGeneratorService {
  constructor(
    @Inject("OPENAI_CLIENT") private readonly aiClient: OpenAI,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async generateFromPdf(
    pdfBuffer: Buffer,
    templateId: string,
  ): Promise<{ previewImageUrl: string } & TemplateStructureJson> {
    // 1. PDF → PNG via pdftoppm (poppler) — pixel-perfect, no browser involved
    const pdfScreenshot = await this.pdfToImage(pdfBuffer);

    // 2. Upload PDF screenshot as preview
    const previewKey = `templates/${templateId}/preview-${Date.now()}.png`;
    const previewImageUrl = await this.storage.putObject(
      previewKey,
      pdfScreenshot,
      "image/png",
    );

    // 3. PNG → HTML + fragments via GPT-4o Vision
    const structure = await this.generateHtmlFromImage(pdfScreenshot);

    return { previewImageUrl, ...structure };
  }

  private async pdfToImage(pdfBuffer: Buffer): Promise<Buffer> {
    const id = `earlycv-tpl-${Date.now()}`;
    const pdfPath = join(tmpdir(), `${id}.pdf`);
    const pngPrefix = join(tmpdir(), id);
    const pngPath = `${pngPrefix}.png`;

    writeFileSync(pdfPath, pdfBuffer);

    try {
      // pdftoppm from poppler-utils: renders PDF page to PNG, pixel-perfect
      // -r 150: 150 DPI (good quality, reasonable file size)
      // -singlefile: output a single file (first page only)
      // -png: PNG output format
      await execFileAsync("pdftoppm", [
        "-r",
        "150",
        "-png",
        "-singlefile",
        pdfPath,
        pngPrefix,
      ]);

      const { readFileSync } = await import("node:fs");
      return readFileSync(pngPath);
    } finally {
      for (const path of [pdfPath, pngPath]) {
        try {
          unlinkSync(path);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  private async generateHtmlFromImage(
    pngBuffer: Buffer,
  ): Promise<TemplateStructureJson> {
    const base64 = pngBuffer.toString("base64");

    const response = await this.aiClient.chat.completions.create({
      // biome-ignore lint/suspicious/noExplicitAny: OpenAI dual-package hazard
      model: "gpt-4o" as any,
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${base64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: "Analise este template de currículo e gere o HTML/CSS conforme as instruções.",
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "";
    return this.parseGeneratedHtml(raw);
  }

  // Remove markdown code fences (```html ... ```) that the AI sometimes wraps around HTML fragments.
  // Matches any line that is only backticks (any count) optionally followed by "html".
  private stripCodeFences(str: string): string {
    return str.replace(/^`+(?:html)?\s*$/gm, "").trim();
  }

  private parseGeneratedHtml(raw: string): TemplateStructureJson {
    const parts = raw.split(
      /---(?:SECTION_HEADER|SECTION_ITEM|BULLET_ITEM)---/,
    );

    return {
      templateHtml: this.stripCodeFences(parts[0] ?? ""),
      sectionHeaderHtml:
        this.stripCodeFences(parts[1] ?? "") ||
        '<div style="margin-top:16px"><strong>{{sectionTitle}}</strong><hr style="border:1px solid #000"/></div>',
      sectionItemHtml:
        this.stripCodeFences(parts[2] ?? "") ||
        '<div style="margin-bottom:8px"><div>{{heading}} | {{subheading}} | {{dateRange}}</div>{{bulletsHtml}}</div>',
      bulletItemHtml:
        this.stripCodeFences(parts[3] ?? "") || "<li>{{bulletText}}</li>",
    };
  }

  async screenshotHtml(html: string): Promise<Buffer> {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({
        width: 794,
        height: 1123,
        deviceScaleFactor: 2,
      });
      await page.setContent(html, { waitUntil: "networkidle0" });
      const png = await page.screenshot({ type: "png", fullPage: false });
      return Buffer.from(png);
    } finally {
      await browser.close();
    }
  }
}
