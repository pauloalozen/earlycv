import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import type { ResumeTemplateDocxService } from "../resume-templates/resume-template-docx.service";
import { CvAdaptationDocxService } from "./cv-adaptation-docx.service";
import type { CvAdaptationOutput } from "./dto/cv-adaptation-output.types";

describe("CvAdaptationDocxService", () => {
  it("sets section visibility flags to false when certifications and languages are empty", async () => {
    const fillFromStorage = mock.fn(async () => Buffer.from("docx"));
    const templateDocx = {
      fillFromStorage,
      docxToPdf: mock.fn(async () => Buffer.from("pdf")),
    } as unknown as ResumeTemplateDocxService;

    const service = new CvAdaptationDocxService(templateDocx);

    const output: CvAdaptationOutput = {
      summary: "Resumo",
      sections: [
        {
          sectionType: "header",
          title: "Header",
          items: [{ heading: "Ana", bullets: ["ana@cv.com"] }],
        },
        {
          sectionType: "experience",
          title: "Experiencia",
          items: [{ heading: "Engenheira", bullets: ["Resultado"] }],
        },
      ],
      highlightedSkills: [],
      removedSections: [],
    };

    await service.generateDocx(output, "https://bucket/template.docx");

    const calls = fillFromStorage.mock.calls as Array<{ arguments: unknown[] }>;
    const call = calls[0];
    assert.ok(call);
    const data = call.arguments[1] as {
      hasCertificacoes: boolean;
      hasIdiomas: boolean;
      certificacoes: unknown[];
      idiomas: unknown[];
    };

    assert.equal(data.hasCertificacoes, false);
    assert.equal(data.hasIdiomas, false);
    assert.deepEqual(data.certificacoes, []);
    assert.deepEqual(data.idiomas, []);
  });

  it("sets section visibility flags to true when certifications and languages exist", async () => {
    const fillFromStorage = mock.fn(async () => Buffer.from("docx"));
    const templateDocx = {
      fillFromStorage,
      docxToPdf: mock.fn(async () => Buffer.from("pdf")),
    } as unknown as ResumeTemplateDocxService;

    const service = new CvAdaptationDocxService(templateDocx);

    const output: CvAdaptationOutput = {
      summary: "Resumo",
      sections: [
        {
          sectionType: "header",
          title: "Header",
          items: [{ heading: "Ana", bullets: ["ana@cv.com"] }],
        },
        {
          sectionType: "certifications",
          title: "Certificacoes",
          items: [
            {
              heading: "PL-300",
              subheading: "Microsoft",
              dateRange: "2024",
              bullets: [],
            },
          ],
        },
        {
          sectionType: "languages",
          title: "Idiomas",
          items: [{ heading: "Ingles", subheading: "Avancado", bullets: [] }],
        },
      ],
      highlightedSkills: [],
      removedSections: [],
    };

    await service.generateDocx(output, "https://bucket/template.docx");

    const calls = fillFromStorage.mock.calls as Array<{ arguments: unknown[] }>;
    const call = calls[0];
    assert.ok(call);
    const data = call.arguments[1] as {
      hasCertificacoes: boolean;
      hasIdiomas: boolean;
      certificacoes: unknown[];
      idiomas: unknown[];
    };

    assert.equal(data.hasCertificacoes, true);
    assert.equal(data.hasIdiomas, true);
    assert.equal(data.certificacoes.length, 1);
    assert.equal(data.idiomas.length, 1);
  });
});
