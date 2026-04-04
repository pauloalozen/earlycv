import type { CvAdaptationOutput } from "@earlycv/ai";
import { Injectable } from "@nestjs/common";

@Injectable()
export class CvAdaptationPdfService {
  async generateAdaptedPdf(output: CvAdaptationOutput): Promise<Buffer> {
    // For MVP: return a simple text-based PDF representation
    // In production, use Puppeteer to render HTML to PDF

    const html = this.buildHtml(output);

    // Placeholder: return a simple text buffer
    // TODO: Implement Puppeteer integration in Task 8
    return Buffer.from(html, "utf-8");
  }

  private buildHtml(output: CvAdaptationOutput): string {
    const sectionsHtml = output.sections
      .map((section) => {
        const itemsHtml = section.items
          .map((item) => {
            const bulletsHtml = item.bullets
              .map((bullet) => `<li>${this.escapeHtml(bullet)}</li>`)
              .join("\n");
            return `
              <div class="item">
                <h4>${this.escapeHtml(item.heading)}</h4>
                ${item.subheading ? `<p class="subheading">${this.escapeHtml(item.subheading)}</p>` : ""}
                ${item.dateRange ? `<p class="date-range">${this.escapeHtml(item.dateRange)}</p>` : ""}
                ${bulletsHtml ? `<ul>${bulletsHtml}</ul>` : ""}
              </div>
            `;
          })
          .join("\n");

        return `
          <section>
            <h3>${this.escapeHtml(section.title)}</h3>
            ${itemsHtml}
          </section>
        `;
      })
      .join("\n");

    const skillsHtml = output.highlightedSkills
      .map((skill) => `<li>${this.escapeHtml(skill)}</li>`)
      .join("\n");

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>CV Adaptado</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 8.5in;
              margin: 0;
              padding: 0.5in;
            }
            .summary {
              margin-bottom: 1.5em;
              font-size: 0.95em;
            }
            section {
              margin-bottom: 1.5em;
            }
            h3 {
              font-size: 1.1em;
              margin: 0.5em 0;
              border-bottom: 1px solid #ddd;
              padding-bottom: 0.25em;
            }
            .item {
              margin-bottom: 1em;
            }
            h4 {
              margin: 0.5em 0 0.25em 0;
              font-size: 1em;
            }
            .subheading {
              margin: 0.25em 0;
              font-weight: bold;
            }
            .date-range {
              margin: 0.25em 0;
              font-size: 0.9em;
              color: #666;
            }
            ul {
              margin: 0.5em 0;
              padding-left: 1.5em;
            }
            li {
              margin-bottom: 0.25em;
              font-size: 0.9em;
            }
            .skills {
              margin-top: 1.5em;
            }
            .skills h3 {
              margin-bottom: 0.5em;
            }
            .skills ul {
              display: flex;
              flex-wrap: wrap;
              gap: 0.5em;
              list-style: none;
              padding: 0;
            }
            .skills li {
              background: #f0f0f0;
              padding: 0.25em 0.5em;
              border-radius: 0.25em;
              font-size: 0.85em;
              margin: 0;
            }
          </style>
        </head>
        <body>
          <div class="summary">
            <p>${this.escapeHtml(output.summary)}</p>
          </div>

          ${sectionsHtml}

          <div class="skills">
            <h3>Skills</h3>
            <ul>${skillsHtml}</ul>
          </div>
        </body>
      </html>
    `;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}
