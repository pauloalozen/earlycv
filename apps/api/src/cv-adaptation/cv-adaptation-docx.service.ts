import { Inject, Injectable } from "@nestjs/common";
import PizZip from "pizzip";

import { ResumeTemplateDocxService } from "../resume-templates/resume-template-docx.service";
import type {
  CvAdaptationOutput,
  CvSection,
} from "./dto/cv-adaptation-output.types";

@Injectable()
export class CvAdaptationDocxService {
  constructor(
    @Inject(ResumeTemplateDocxService)
    private readonly templateDocx: ResumeTemplateDocxService,
  ) {}

  /**
   * Generate DOCX from a stored template file + CV adaptation output.
   * Falls back to a plain text buffer if no template file URL is provided.
   */
  async generateDocx(
    output: CvAdaptationOutput,
    templateFileUrl: string | null,
  ): Promise<Buffer> {
    if (!templateFileUrl?.endsWith(".docx")) {
      return this.buildFallbackDocx(output);
    }
    const data = this.mapOutputToTemplateData(output);
    return this.templateDocx.fillFromStorage(templateFileUrl, data);
  }

  /** Convert a filled DOCX buffer to PDF via LibreOffice. */
  toPdf(docxBuffer: Buffer): Promise<Buffer> {
    return this.templateDocx.docxToPdf(docxBuffer);
  }

  /** Minimal fallback when no DOCX template is available. */
  private buildFallbackDocx(output: CvAdaptationOutput): Buffer {
    const lines: string[] = [output.summary ?? ""];
    for (const section of output.sections ?? []) {
      if (section.sectionType === "header") continue;
      lines.push(`\n${section.title.toUpperCase()}`);
      for (const item of section.items ?? []) {
        lines.push(
          `${item.heading}${item.subheading ? ` | ${item.subheading}` : ""}${item.dateRange ? ` | ${item.dateRange}` : ""}`,
        );
        for (const b of item.bullets ?? []) lines.push(`• ${b}`);
      }
    }
    const escapeXml = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");

    const paragraphs = lines
      .filter((line) => line.trim().length > 0)
      .map(
        (line) =>
          `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`,
      )
      .join("");

    const zip = new PizZip();
    zip.file(
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    );
    zip.file(
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    );
    zip.file(
      "word/document.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs}
    <w:sectPr/>
  </w:body>
</w:document>`,
    );

    return zip.generate({ type: "nodebuffer" }) as Buffer;
  }

  private mapOutputToTemplateData(output: CvAdaptationOutput) {
    const headerSection = output.sections?.find(
      (s) => s.sectionType === "header",
    );
    const experienceSection = output.sections?.find(
      (s) => s.sectionType === "experience",
    );
    const skillsSection = output.sections?.find(
      (s) => s.sectionType === "skills",
    );
    const educationSection = output.sections?.find(
      (s) => s.sectionType === "education",
    );
    const certSection = output.sections?.find(
      (s) => s.sectionType === "certifications",
    );
    const langSection = output.sections?.find(
      (s) => s.sectionType === "languages",
    );

    const { candidateName, phone, email, location } =
      this.extractHeader(headerSection);

    // mainGoal: use AI-generated field when available, fallback to first sentence of summary
    const summaryText = output.summary ?? "";
    let mainGoal = output.mainGoal ?? "";
    if (!mainGoal) {
      const firstSentenceEnd = summaryText.search(/[.!?]\s/);
      mainGoal =
        firstSentenceEnd > 0 && firstSentenceEnd < 180
          ? summaryText.slice(0, firstSentenceEnd + 1)
          : summaryText.slice(0, 180);
    }

    return {
      candidateName,
      phone,
      email,
      location,
      mainGoal,
      summary: summaryText,
      items: this.mapExperience(experienceSection),
      competencias: this.mapSkills(skillsSection),
      educacao: this.mapCourseItems(educationSection),
      certificacoes: this.mapCourseItems(certSection),
      idiomas: this.mapLanguages(langSection),
    };
  }

  private extractHeader(section?: CvSection) {
    const bullets = section?.items?.[0]?.bullets ?? [];
    const candidateName = section?.items?.[0]?.heading ?? "";

    const phone =
      bullets.find((b) => /[\d\s()+-]{7,}/.test(b) && !b.includes("@")) ?? "";
    const email = bullets.find((b) => b.includes("@")) ?? "";
    const location = bullets
      .filter((b) => b !== phone && b !== email)
      .join(" | ");

    return { candidateName, phone, email, location };
  }

  private mapExperience(section?: CvSection) {
    return (section?.items ?? []).map((item) => ({
      heading: item.heading ?? "",
      subheading: item.subheading ?? "",
      dateRange: item.dateRange ?? "",
      bullets: (item.bullets ?? []).map((text) => ({ text })),
    }));
  }

  private mapSkills(section?: CvSection) {
    if (!section?.items?.length) return [];

    // If items have headings, treat each item as a competency group
    const hasGroups = section.items.some((i) => i.heading);

    if (hasGroups) {
      return section.items.map((item) => ({
        groupComp: item.heading ?? "",
        comps: item.bullets.join(", "),
      }));
    }

    // Flat list: emit as a single entry with no group
    const allSkills = section.items.flatMap((i) => i.bullets);
    return [{ groupComp: "", comps: allSkills.join(", ") }];
  }

  private mapCourseItems(section?: CvSection) {
    return (section?.items ?? []).map((item) => ({
      courseName: item.heading ?? "",
      instituitionName: item.subheading ?? "",
      cityInstituition: item.bullets?.[0] ?? "",
      conclusionCourse: item.dateRange ?? "",
    }));
  }

  private mapLanguages(section?: CvSection) {
    return (section?.items ?? []).map((item) => ({
      language: item.heading ?? "",
      languageLevel: item.subheading ?? item.bullets?.[0] ?? "",
    }));
  }
}
