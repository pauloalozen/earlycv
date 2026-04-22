import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import PizZip from "pizzip";

import { wrapOptionalDocxSections } from "../resume-templates/docx-conditional-sections";

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function hasArg(flag: string): boolean {
  return process.argv.includes(flag);
}

function extractKeyFromUrl(url: string, bucket: string): string {
  const marker = `/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) {
    throw new Error(`Cannot extract key from URL: ${url}`);
  }
  return url.slice(idx + marker.length);
}

async function readBodyToBuffer(body: unknown): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function main() {
  const prisma = new PrismaClient();
  const bucket = process.env.S3_BUCKET ?? "earlycv-local";
  const endpoint = process.env.S3_ENDPOINT;

  const client = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint,
    forcePathStyle: !!endpoint,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });

  const templateId = getArg("--template-id");
  const dryRun = hasArg("--dry-run");

  const templates = await prisma.resumeTemplate.findMany({
    where: {
      ...(templateId ? { id: templateId } : {}),
      fileUrl: { not: null },
    },
    select: { id: true, slug: true, fileUrl: true },
  });

  if (templates.length === 0) {
    console.log("No templates found.");
    await prisma.$disconnect();
    return;
  }

  for (const template of templates) {
    const fileUrl = template.fileUrl;
    if (!fileUrl?.endsWith(".docx")) {
      continue;
    }

    const key = extractKeyFromUrl(fileUrl, bucket);

    const object = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const docxBuffer = await readBodyToBuffer(object.Body);

    const zip = new PizZip(docxBuffer);
    const documentPath = "word/document.xml";
    const xml = zip.file(documentPath)?.asText();

    if (!xml) {
      console.log(`[${template.slug}] skipped: missing ${documentPath}`);
      continue;
    }

    const wrapped = wrapOptionalDocxSections(xml);
    if (!wrapped.changed) {
      console.log(`[${template.slug}] already patched`);
      continue;
    }

    if (dryRun) {
      console.log(`[${template.slug}] would patch`);
      continue;
    }

    zip.file(documentPath, wrapped.xml);
    const patchedBuffer = zip.generate({ type: "nodebuffer" }) as Buffer;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: patchedBuffer,
        ContentType: DOCX_CONTENT_TYPE,
      }),
    );

    console.log(`[${template.slug}] patched`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
