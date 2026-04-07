import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import type {
  CvAdaptationOutput,
  CvSection,
} from "./dto/cv-adaptation-output.types";

export interface TemplateStructureJson {
  templateHtml?: string;
  sectionHeaderHtml?: string;
  sectionItemHtml?: string;
  bulletItemHtml?: string;
  pdfUrl?: string;
  docxUrl?: string;
}

@Injectable()
export class CvAdaptationPdfService {
  async generatePdf(
    output: CvAdaptationOutput,
    structureJsonOrSlug: TemplateStructureJson | string | null,
  ): Promise<Buffer> {
    const structureJson =
      typeof structureJsonOrSlug === "string" || structureJsonOrSlug === null
        ? null
        : structureJsonOrSlug;
    const templateSlug =
      typeof structureJsonOrSlug === "string"
        ? structureJsonOrSlug
        : "classico-simples";

    const html = structureJson?.templateHtml
      ? this.injectIntoTemplateHtml(output, structureJson)
      : this.buildHtml(output, templateSlug);

    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  /** @deprecated Use generatePdf(output, structureJson) instead */
  async generateAdaptedPdf(output: CvAdaptationOutput): Promise<Buffer> {
    return this.generatePdf(output, "classico-simples");
  }

  // Strip markdown code fences that the AI may have included in stored fragments.
  private stripCodeFences(str: string): string {
    return str.replace(/^`+(?:html)?\s*$/gm, "").trim();
  }

  private injectIntoTemplateHtml(
    output: CvAdaptationOutput,
    structureJson: TemplateStructureJson,
  ): string {
    const templateHtml = this.stripCodeFences(structureJson.templateHtml ?? "");
    const sectionHeaderHtml = structureJson.sectionHeaderHtml
      ? this.stripCodeFences(structureJson.sectionHeaderHtml)
      : undefined;
    const sectionItemHtml = structureJson.sectionItemHtml
      ? this.stripCodeFences(structureJson.sectionItemHtml)
      : undefined;
    const bulletItemHtml = structureJson.bulletItemHtml
      ? this.stripCodeFences(structureJson.bulletItemHtml)
      : undefined;

    const headerSection = output.sections?.find(
      (s) => s.sectionType === "header",
    );
    const contentSections =
      output.sections?.filter((s) => s.sectionType !== "header") ?? [];

    const candidateName = headerSection?.items?.[0]?.heading ?? "";
    const jobTitle = "";
    const contactLine = (headerSection?.items?.[0]?.bullets ?? []).join(" | ");
    const summary = this.escapeHtml(output.summary ?? "");

    const sectionsHtml = contentSections
      .map((section) => {
        const itemsHtml = (section.items ?? [])
          .map((item) => {
            const bulletsHtml =
              item.bullets && item.bullets.length > 0
                ? `<ul>${item.bullets.map((b) => (bulletItemHtml ?? "<li>{{bulletText}}</li>").replace("{{bulletText}}", this.escapeHtml(b))).join("")}</ul>`
                : "";

            return (
              sectionItemHtml ??
              '<div style="margin-bottom:8px">{{heading}}</div>'
            )
              .replace("{{heading}}", this.escapeHtml(item.heading ?? ""))
              .replace("{{subheading}}", this.escapeHtml(item.subheading ?? ""))
              .replace("{{dateRange}}", this.escapeHtml(item.dateRange ?? ""))
              .replace("{{bulletsHtml}}", bulletsHtml);
          })
          .join("");

        return (
          (
            sectionHeaderHtml ?? "<div><strong>{{sectionTitle}}</strong></div>"
          ).replace("{{sectionTitle}}", this.escapeHtml(section.title)) +
          itemsHtml
        );
      })
      .join("");

    const injected = (templateHtml ?? "")
      .replace("{{candidateName}}", this.escapeHtml(candidateName))
      .replace("{{jobTitle}}", this.escapeHtml(jobTitle))
      .replace("{{contactLine}}", this.escapeHtml(contactLine))
      .replace("{{summary}}", summary)
      .replace("{{sectionsHtml}}", sectionsHtml);

    return this.translateEnglishLabels(injected);
  }

  // Translate common English CV section labels to Portuguese for templates
  // that were generated before the system prompt enforced pt-BR.
  private translateEnglishLabels(html: string): string {
    const translations: [RegExp, string][] = [
      [/\bPROFESSIONAL SUMMARY\b/gi, "RESUMO PROFISSIONAL"],
      [/\bProfessional Summary\b/g, "Resumo Profissional"],
      [/\bWORK EXPERIENCE\b/gi, "EXPERIÊNCIA PROFISSIONAL"],
      [/\bWork Experience\b/g, "Experiência Profissional"],
      [/\bEDUCATION\b/gi, "FORMAÇÃO ACADÊMICA"],
      [/\bEducation\b/g, "Formação Acadêmica"],
      [/\bSKILLS\b/gi, "COMPETÊNCIAS"],
      [/\bSkills\b/g, "Competências"],
      [/\bCERTIFICATIONS?\b/gi, "CERTIFICAÇÕES"],
      [/\bCertifications?\b/g, "Certificações"],
      [/\bLANGUAGES?\b/gi, "IDIOMAS"],
      [/\bLanguages?\b/g, "Idiomas"],
      [/\bCONTACT\b/gi, "CONTATO"],
      [/\bContact\b/g, "Contato"],
      [/\bABOUT ME\b/gi, "SOBRE MIM"],
      [/\bAbout Me\b/g, "Sobre Mim"],
      [/\bSUMMARY\b/g, "RESUMO"],
      [/\bSummary\b/g, "Resumo"],
      [/\bEXPERIENCE\b/g, "EXPERIÊNCIA"],
      [/\bExperience\b/g, "Experiência"],
    ];

    let result = html;
    for (const [pattern, replacement] of translations) {
      result = result.replace(pattern, replacement);
    }
    return result;
  }

  private buildHtml(output: CvAdaptationOutput, templateSlug: string): string {
    const templatePath = this.resolveTemplatePath(templateSlug);
    let template = readFileSync(templatePath, "utf-8");

    const headerSection = output.sections?.find(
      (s) => s.sectionType === "header",
    );
    const contentSections =
      output.sections?.filter((s) => s.sectionType !== "header") ?? [];

    const candidateName = headerSection?.items?.[0]?.heading ?? "";
    const contactLine = (headerSection?.items?.[0]?.bullets ?? []).join(" | ");
    const summary = this.escapeHtml(output.summary ?? "");
    const sectionsHtml = this.buildSectionsHtml(contentSections);

    template = template
      .replace("{{candidateName}}", this.escapeHtml(candidateName))
      .replace("{{contactLine}}", this.escapeHtml(contactLine))
      .replace("{{summary}}", summary)
      .replace("{{sectionsHtml}}", sectionsHtml);

    return template;
  }

  private resolveTemplatePath(templateSlug: string): string {
    const slugPath = join(
      __dirname,
      "templates",
      templateSlug,
      "template.html",
    );
    if (existsSync(slugPath)) {
      return slugPath;
    }
    const fallbackPath = join(
      __dirname,
      "templates",
      "classico-simples",
      "template.html",
    );
    return fallbackPath;
  }

  private buildSectionsHtml(sections: CvSection[]): string {
    return sections
      .map((section) => {
        const itemsHtml = (section.items ?? [])
          .map((item) => {
            const bulletsList =
              item.bullets && item.bullets.length > 0
                ? `<ul class="item-bullets">${item.bullets.map((b) => `<li>${this.escapeHtml(b)}</li>`).join("")}</ul>`
                : "";

            const subheadingHtml = item.subheading
              ? `<div class="item-subheading">${this.escapeHtml(item.subheading)}</div>`
              : "";

            const dateHtml = item.dateRange
              ? `<span class="item-date">${this.escapeHtml(item.dateRange)}</span>`
              : "";

            return `<div class="section-item" style="margin-bottom:14px">
  <div class="item-header">
    <span class="item-heading">${this.escapeHtml(item.heading)}</span>
    ${dateHtml}
  </div>
  ${subheadingHtml}
  ${bulletsList}
</div>`;
          })
          .join("");

        return `<section class="cv-section">
  <h2 class="section-title">${this.escapeHtml(section.title)}</h2>
  ${itemsHtml}
</section>`;
      })
      .join("");
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}
