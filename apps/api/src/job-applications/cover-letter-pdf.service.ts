import { Injectable } from "@nestjs/common";

type CoverLetterDocInput = {
  body: string;
  jobTitle: string;
  companyName: string;
  candidateName: string;
  contactLine: string;
  generatedAt: Date;
};

@Injectable()
export class CoverLetterPdfService {
  async generatePdf(input: CoverLetterDocInput): Promise<Buffer> {
    const html = this.buildHtml(input);

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

  private buildHtml(input: CoverLetterDocInput): string {
    const paragraphs = input.body
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => `<p>${this.escapeHtml(p)}</p>`)
      .join("\n");

    const date = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(input.generatedAt);

    const closing = input.candidateName
      ? `<p class="closing">Atenciosamente,<br /><strong>${this.escapeHtml(input.candidateName)}</strong></p>`
      : "";

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.6; color: #111111; background: #ffffff; padding: 40px 48px; width: 210mm; min-height: 297mm; }
  .cv-header { text-align: center; margin-bottom: 16px; }
  .cv-header .candidate-name { font-size: 22pt; font-weight: bold; color: #111111; margin-bottom: 4px; }
  .cv-header .contact-line { font-size: 9pt; color: #666666; }
  .divider { height: 1px; background: #cccccc; margin: 16px 0; }
  .label { font-size: 11pt; font-weight: bold; letter-spacing: 0.5px; color: #111111; text-transform: uppercase; margin-bottom: 8px; }
  .meta-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
  .role { font-size: 10pt; font-weight: bold; color: #111111; }
  .role span { font-weight: normal; color: #333333; }
  .date { font-size: 9pt; color: #666666; }
  p { margin: 0 0 12px 0; text-align: justify; }
  p.closing { margin-top: 8px; text-align: left; }
</style>
</head>
<body>
  <div class="cv-header">
    ${input.candidateName ? `<div class="candidate-name">${this.escapeHtml(input.candidateName)}</div>` : ""}
    ${input.contactLine ? `<div class="contact-line">${this.escapeHtml(input.contactLine)}</div>` : ""}
  </div>
  <div class="divider"></div>
  <div class="label">Carta de Apresentação</div>
  <div class="meta-row">
    <div class="role">${this.escapeHtml(input.jobTitle)}<span> — ${this.escapeHtml(input.companyName)}</span></div>
    <div class="date">${this.escapeHtml(date)}</div>
  </div>
  ${paragraphs}
  ${closing}
</body>
</html>`;
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
