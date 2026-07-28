import { Injectable } from "@nestjs/common";
import PizZip from "pizzip";

type CoverLetterDocInput = {
  body: string;
  jobTitle: string;
  companyName: string;
  candidateName: string;
  contactLine: string;
  generatedAt: Date;
};

@Injectable()
export class CoverLetterDocxService {
  generateDocx(input: CoverLetterDocInput): Buffer {
    const escapeXml = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");

    const date = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(input.generatedAt);

    const bodyParagraphs = input.body
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    // Tamanhos em half-points (w:sz), mesma escala usada no header do CV
    // (classico-simples/template.html): nome 22pt, contato 9pt, corpo 10pt.
    type Paragraph = {
      text: string;
      center?: boolean;
      bold?: boolean;
      sizeHalfPt?: number;
      color?: string;
    };

    const paragraphs: Paragraph[] = [];
    if (input.candidateName) {
      paragraphs.push({
        text: input.candidateName,
        center: true,
        bold: true,
        sizeHalfPt: 44,
      });
    }
    if (input.contactLine) {
      paragraphs.push({
        text: input.contactLine,
        center: true,
        sizeHalfPt: 18,
        color: "666666",
      });
    }
    paragraphs.push({ text: "" });
    paragraphs.push({
      text: "CARTA DE APRESENTAÇÃO",
      bold: true,
      sizeHalfPt: 22,
    });
    paragraphs.push({
      text: `${input.jobTitle} — ${input.companyName}  ·  ${date}`,
      sizeHalfPt: 20,
    });
    paragraphs.push({ text: "" });
    for (const p of bodyParagraphs) {
      paragraphs.push({ text: p, sizeHalfPt: 20 });
    }
    if (input.candidateName) {
      paragraphs.push({ text: "" });
      paragraphs.push({ text: "Atenciosamente,", sizeHalfPt: 20 });
      paragraphs.push({
        text: input.candidateName,
        bold: true,
        sizeHalfPt: 20,
      });
    }

    const paragraphsXml = paragraphs
      .map((p) => {
        if (p.text.trim().length === 0) return "<w:p/>";
        const pPr = p.center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : "";
        const rPr = [
          p.bold ? "<w:b/>" : "",
          p.sizeHalfPt ? `<w:sz w:val="${p.sizeHalfPt}"/>` : "",
          p.color ? `<w:color w:val="${p.color}"/>` : "",
        ].join("");
        const rPrXml = rPr ? `<w:rPr>${rPr}</w:rPr>` : "";
        return `<w:p>${pPr}<w:r>${rPrXml}<w:t xml:space="preserve">${escapeXml(p.text)}</w:t></w:r></w:p>`;
      })
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
    ${paragraphsXml}
    <w:sectPr/>
  </w:body>
</w:document>`,
    );

    return zip.generate({ type: "nodebuffer" }) as Buffer;
  }
}
