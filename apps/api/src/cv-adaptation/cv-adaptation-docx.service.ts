import { Inject, Injectable } from "@nestjs/common";
import PizZip from "pizzip";
import { ResumeTemplateDocxService } from "../resume-templates/resume-template-docx.service";
import type {
  CvAdaptationOutput,
  CvSection,
} from "./dto/cv-adaptation-output.types";

const SECTION_LABELS = {
  pt: {
    summary: "RESUMO PROFISSIONAL",
    experience: "EXPERIÊNCIA PROFISSIONAL",
    skills: "COMPETÊNCIAS",
    education: "EDUCAÇÃO",
    certifications: "CERTIFICAÇÕES",
    languages: "IDIOMAS",
  },
  en: {
    summary: "PROFESSIONAL SUMMARY",
    experience: "WORK EXPERIENCE",
    skills: "SKILLS",
    education: "EDUCATION",
    certifications: "CERTIFICATIONS",
    languages: "LANGUAGES",
  },
  es: {
    summary: "RESUMEN PROFESIONAL",
    experience: "EXPERIENCIA LABORAL",
    skills: "COMPETENCIAS",
    education: "EDUCACIÓN",
    certifications: "CERTIFICACIONES",
    languages: "IDIOMAS",
  },
} as const;

export interface ProfileContactFallback {
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  linkedinUrl?: string | null;
}

@Injectable()
export class CvAdaptationDocxService {
  constructor(
    @Inject(ResumeTemplateDocxService)
    private readonly templateDocx: ResumeTemplateDocxService,
  ) {}

  /**
   * Generate DOCX from a stored template file + CV adaptation output.
   * Falls back to a plain text buffer if no template file URL is provided.
   * `profileFallback` são os campos de contato do UserProfile. Quando
   * `contactMode: "override"` (adaptação criada no modo CV master / perfil),
   * eles têm precedência sobre o que a IA escreveu no header — o formulário
   * é a fonte da verdade, o header da IA só serve de complemento. No modo
   * "fallback" (upload de arquivo / texto colado), é o inverso: o header da
   * IA manda, o profile só preenche o que ficou vazio.
   */
  async generateDocx(
    output: CvAdaptationOutput,
    templateFileUrl: string | null,
    profileFallback?: ProfileContactFallback | null,
    contactMode: "fallback" | "override" = "fallback",
  ): Promise<Buffer> {
    if (!templateFileUrl?.endsWith(".docx")) {
      return this.buildFallbackDocx(output);
    }
    const data = this.mapOutputToTemplateData(
      output,
      profileFallback,
      contactMode,
    );
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

  private detectLanguage(output: CvAdaptationOutput): "pt" | "en" | "es" {
    const text = [
      output.summary ?? "",
      ...(output.sections ?? []).map((s) => s.title),
    ]
      .join(" ")
      .toLowerCase();
    const ptScore = (
      text.match(
        /\b(de|para|com|em|uma|não|por|do|da|experiência|formação|idiomas|competências)\b/g,
      ) ?? []
    ).length;
    const enScore = (
      text.match(
        /\b(the|and|with|for|experience|education|skills|languages|certifications|summary)\b/g,
      ) ?? []
    ).length;
    const esScore = (
      text.match(
        /\b(el|la|los|las|con|para|una|por|experiencia|educación|habilidades|competencias|resumen)\b/g,
      ) ?? []
    ).length;
    const scores: Array<["pt" | "en" | "es", number]> = [
      ["en", enScore],
      ["es", esScore],
      ["pt", ptScore],
    ];
    scores.sort((a, b) => b[1] - a[1]);
    return scores[0][1] > 0 ? scores[0][0] : "pt";
  }

  private mapOutputToTemplateData(
    output: CvAdaptationOutput,
    profileFallback?: ProfileContactFallback | null,
    contactMode: "fallback" | "override" = "fallback",
  ) {
    // Fallback only: summary has no section of its own, so it has no
    // AI-generated title to reuse. Every other section title below comes
    // straight from `output` (already in the CV's own language).
    const labels = SECTION_LABELS[this.detectLanguage(output)];

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
    const certSection = this.findSectionByTypeOrTitle(
      output.sections,
      "certifications",
      ["certificacoes", "certificações", "certifications"],
    );
    const langSection = this.findSectionByTypeOrTitle(
      output.sections,
      "languages",
      ["idiomas", "languages"],
    );

    const { candidateName, phone, email, location } = this.extractHeader(
      headerSection,
      profileFallback,
      contactMode,
    );

    const summaryText = output.summary ?? "";
    let mainGoal = output.mainGoal ?? "";
    if (!mainGoal) {
      const firstSentenceEnd = summaryText.search(/[.!?]\s/);
      mainGoal =
        firstSentenceEnd > 0 && firstSentenceEnd < 180
          ? summaryText.slice(0, firstSentenceEnd + 1)
          : summaryText.slice(0, 180);
    }

    const certItems = this.mapCourseItems(certSection);
    const langItems = this.mapLanguages(langSection);
    const extraSections = (output.sections ?? [])
      .filter((s) => s.sectionType === "other")
      .map((s) => ({
        sectionTitle: s.title.toUpperCase(),
        sectionItems: s.items
          .map((item) => ({
            itemHeading: item.heading ?? "",
            itemBullets: (item.bullets ?? [])
              .filter((b) => b.trim())
              .map((b) => ({ bulletText: b })),
          }))
          .filter((i) => i.itemHeading || i.itemBullets.length > 0),
      }))
      .filter((s) => s.sectionItems.length > 0);

    return {
      candidateName,
      phone,
      email,
      location,
      mainGoal,
      hasMainGoal: mainGoal.trim().length > 0,
      summary: summaryText,
      sectionTitleSummary: labels.summary,
      sectionTitleExperience: experienceSection?.title || labels.experience,
      sectionTitleSkills: skillsSection?.title || labels.skills,
      sectionTitleEducation: educationSection?.title || labels.education,
      sectionTitleCertifications: certSection?.title || labels.certifications,
      sectionTitleLanguages: langSection?.title || labels.languages,
      items: this.mapExperience(experienceSection),
      competencias: this.mapSkills(skillsSection),
      educacao: this.mapCourseItems(educationSection),
      hasCertificacoes: certItems.length > 0,
      hasIdiomas: langItems.length > 0,
      certificacoes: certItems,
      idiomas: langItems,
      extraSections,
    };
  }

  private extractHeader(
    section?: CvSection,
    profileFallback?: ProfileContactFallback | null,
    contactMode: "fallback" | "override" = "fallback",
  ) {
    const bullets = section?.items?.[0]?.bullets ?? [];

    const aiName = section?.items?.[0]?.heading?.trim() ?? "";
    const aiPhone =
      bullets.find((b) => /[\d\s()+-]{7,}/.test(b) && !b.includes("@")) ?? "";
    const aiEmail = bullets.find((b) => b.includes("@")) ?? "";
    const aiLocation = bullets
      .filter((b) => b !== aiPhone && b !== aiEmail)
      .join(" | ");

    const profileName = profileFallback?.fullName?.trim() ?? "";
    const profilePhone = profileFallback?.phone?.trim() ?? "";
    const profileEmail = profileFallback?.email?.trim() ?? "";
    const profileLocationBase = [profileFallback?.city, profileFallback?.state]
      .filter((v) => v?.trim())
      .join(", ");
    const profileLocation = [profileLocationBase, profileFallback?.linkedinUrl]
      .filter((v) => v?.trim())
      .join(" | ");

    // Modo "override" (CV master / perfil): o formulário é a fonte da
    // verdade e tem precedência sobre o que a IA reescreveu no header — a IA
    // só complementa o que o profile não tiver. Modo "fallback" (upload de
    // arquivo/texto): é o contrário, o header da IA manda.
    const profileFirst = contactMode === "override";

    return {
      candidateName: profileFirst
        ? profileName || aiName
        : aiName || profileName,
      phone: profileFirst ? profilePhone || aiPhone : aiPhone || profilePhone,
      email: profileFirst ? profileEmail || aiEmail : aiEmail || profileEmail,
      location: profileFirst
        ? profileLocation || aiLocation
        : aiLocation || profileLocation,
    };
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
    return (section?.items ?? [])
      .map((item) => ({
        courseName: item.heading?.trim() ?? "",
        instituitionName: item.subheading?.trim() ?? "",
        cityInstituition: item.bullets?.[0]?.trim() ?? "",
        conclusionCourse: item.dateRange?.trim() ?? "",
      }))
      .filter((item) => {
        return (
          item.courseName.length > 0 ||
          item.instituitionName.length > 0 ||
          item.cityInstituition.length > 0 ||
          item.conclusionCourse.length > 0
        );
      });
  }

  private mapLanguages(section?: CvSection) {
    const pairs: Array<{ language: string; languageLevel: string }> = [];

    for (const item of section?.items ?? []) {
      const heading = item.heading?.trim() ?? "";
      const subheading = item.subheading?.trim() ?? "";
      if (heading) {
        // Structured shape: one item per language (heading = language, subheading = level).
        pairs.push({ language: heading, languageLevel: subheading });
        continue;
      }

      // Per the AI prompt, when there's a single language group the model omits
      // item.heading and lists each language as free text in its own bullet
      // (e.g. "English: Advanced"). Split each bullet into language + level.
      for (const bullet of item.bullets ?? []) {
        const text = bullet?.trim() ?? "";
        if (!text) continue;
        const match = text.match(/^(.+?)\s*[:–—-]\s*(.+)$/);
        pairs.push(
          match
            ? { language: match[1].trim(), languageLevel: match[2].trim() }
            : { language: text, languageLevel: "" },
        );
      }
    }

    return pairs.filter(
      (item) => item.language.length > 0 || item.languageLevel.length > 0,
    );
  }

  private findSectionByTypeOrTitle(
    sections: CvAdaptationOutput["sections"] | undefined,
    sectionType: CvSection["sectionType"],
    titleAliases: string[],
  ) {
    const byType = sections?.find(
      (section) => section.sectionType === sectionType,
    );
    if (byType) {
      return byType;
    }

    return sections?.find((section) => {
      const normalizedTitle = section.title.trim().toLowerCase();
      return titleAliases.includes(normalizedTitle);
    });
  }
}
