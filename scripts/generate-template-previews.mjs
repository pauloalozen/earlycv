/**
 * Gera screenshots dos templates HTML e atualiza previewImageUrl no banco.
 * Uso: node scripts/generate-template-previews.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Sample CV data to fill the templates
const SAMPLE_OUTPUT = {
  summary:
    "Results-driven Data & AI Manager with 19 years of experience leading analytics platforms, data governance, and business-driven AI initiatives across large enterprises.",
  sections: [
    {
      sectionType: "header",
      title: "Header",
      items: [
        {
          heading: "Paulo Alozen",
          bullets: [
            "+55 11 99999-9999",
            "paulo@email.com",
            "linkedin.com/in/pauloalozen",
            "São Paulo, SP",
          ],
        },
      ],
    },
    {
      sectionType: "experience",
      title: "Professional Experience",
      items: [
        {
          heading: "Data & AI Manager",
          subheading: "Suzano SA",
          dateRange: "Jun 2023 – Mar 2026",
          bullets: [
            "Led a team of 11 with a R$4MM annual budget and full data governance oversight.",
            "Structured corporate Data Lake integrating multiple sources to support AI and analytics.",
            "Launched automation program saving over 6,500 hours annually.",
          ],
        },
        {
          heading: "Data Science Specialist",
          subheading: "Eldorado Brasil Celulose SA",
          dateRange: "Jun 2019 – May 2023",
          bullets: [
            "Led end-to-end data science projects using CRISP-DM framework.",
            "Built Data Lake and analytics pipelines to enable scalable analytics.",
          ],
        },
      ],
    },
    {
      sectionType: "skills",
      title: "Key Skills",
      items: [
        {
          heading: "Data & AI",
          bullets: [
            "Machine Learning",
            "Deep Learning",
            "Data Engineering",
            "ETL Pipelines",
          ],
        },
        {
          heading: "Analytics & BI",
          bullets: ["Power BI", "Qlik Sense", "Tableau", "Looker"],
        },
      ],
    },
    {
      sectionType: "education",
      title: "Education",
      items: [
        {
          heading: "MBA — Business Intelligence Management",
          subheading: "USP — Fundação Vanzolini",
          dateRange: "Feb 2013 – Dec 2014",
          bullets: [],
        },
      ],
    },
  ],
  highlightedSkills: [
    "Machine Learning",
    "Data Engineering",
    "Power BI",
    "AWS",
    "Python",
  ],
  removedSections: [],
  adaptationNotes: "Repositioned for senior data leadership roles.",
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSectionsHtml(sections) {
  return sections
    .filter((s) => s.sectionType !== "header")
    .map((section) => {
      const itemsHtml = (section.items ?? [])
        .map((item) => {
          const dateHtml = item.dateRange
            ? `<span class="item-date">${escapeHtml(item.dateRange)}</span>`
            : "";
          const subHtml = item.subheading
            ? `<div class="item-subheading">${escapeHtml(item.subheading)}</div>`
            : "";
          const bulletsHtml = item.bullets?.length
            ? `<ul class="item-bullets">${item.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`
            : "";
          return `<div class="section-item">
  <div class="item-header">
    <span class="item-heading">${escapeHtml(item.heading)}</span>
    ${dateHtml}
  </div>
  ${subHtml}
  ${bulletsHtml}
</div>`;
        })
        .join("");
      return `<section class="cv-section">
  <h2 class="section-title">${escapeHtml(section.title)}</h2>
  ${itemsHtml}
</section>`;
    })
    .join("");
}

function buildHtml(templateSlug, output) {
  const templatePath = join(
    ROOT,
    "apps/api/src/cv-adaptation/templates",
    templateSlug,
    "template.html",
  );
  const template = readFileSync(templatePath, "utf-8");

  const headerSection = output.sections.find((s) => s.sectionType === "header");
  const candidateName = headerSection?.items?.[0]?.heading ?? "";
  const contactLine = (headerSection?.items?.[0]?.bullets ?? []).join(" | ");
  const sectionsHtml = buildSectionsHtml(output.sections);

  return template
    .replace("{{candidateName}}", escapeHtml(candidateName))
    .replace("{{contactLine}}", escapeHtml(contactLine))
    .replace("{{summary}}", escapeHtml(output.summary))
    .replace("{{sectionsHtml}}", sectionsHtml);
}

const TEMPLATES = [
  { slug: "classico-simples", id: "cmnm9kv9z0002qwc62vsrkh8f" },
  { slug: "executivo", id: "f8e4aac3-746b-4f42-a04d-55a40c6be1a3" },
  { slug: "moderno-lateral", id: "13778564-0bf4-43ec-be6d-d7ace987392b" },
];

const API_URL = process.env.API_URL ?? "http://localhost:4000";

// Get admin token — needs BACKOFFICE_SESSION env or pass as arg
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? process.argv[2];
if (!ADMIN_TOKEN) {
  console.error(
    "Usage: ADMIN_TOKEN=<token> node scripts/generate-template-previews.mjs\n" +
      "Get the token from the browser: DevTools → Application → Cookies → earlycv-backoffice-token",
  );
  process.exit(1);
}

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

for (const { slug, id } of TEMPLATES) {
  console.log(`\n📄 Generating preview for: ${slug}`);

  const html = buildHtml(slug, SAMPLE_OUTPUT);
  const page = await browser.newPage();
  // Viewport wider than A4 so body margin is visible
  await page.setViewport({ width: 900, height: 1200, deviceScaleFactor: 1.5 });

  await page.setContent(html, { waitUntil: "networkidle0" });

  // Inject preview margin without modifying the template files
  await page.addStyleTag({
    content:
      "html { background: #f0f0f0; } body { margin: 32px auto !important; max-width: 794px; box-shadow: 0 2px 12px rgba(0,0,0,0.15); }",
  });

  // Capture top portion with margins visible
  const screenshotBuffer = await page.screenshot({
    type: "png",
    clip: { x: 0, y: 0, width: 900, height: 640 },
  });

  await page.close();

  // Upload to API as multipart form
  const formData = new FormData();
  const blob = new Blob([screenshotBuffer], { type: "image/png" });
  formData.append("previewImage", blob, `${slug}-preview.png`);

  const res = await fetch(
    `${API_URL}/api/admin/resume-templates/${id}/upload-preview`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
      body: formData,
    },
  );

  if (res.ok) {
    const data = await res.json();
    console.log(`✅ Preview uploaded: ${data.previewImageUrl}`);
  } else {
    const err = await res.text();
    console.error(`❌ Upload failed for ${slug}: ${err}`);
  }
}

await browser.close();
console.log("\n✅ Done.");
