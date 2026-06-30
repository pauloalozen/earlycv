/**
 * One-shot script: upload templateATS - Minimalista v2.docx to MinIO,
 * create a new resumeTemplate DB record, and deactivate v1.
 *
 * Run from repo root:
 *   npx dotenv-cli -e .env -- npx ts-node -P apps/api/tsconfig.json --transpile-only apps/api/src/scripts/upload-template-v2.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

const V2_PATH = path.resolve(
  __dirname,
  "../../../../../templateCV/templateATS - Minimalista v2.docx",
);
const V1_SLUG = "ats-minimalista";
const V2_SLUG = "ats-minimalista-v2";

async function main() {
  const prisma = new PrismaClient();
  const bucket = process.env.S3_BUCKET ?? "earlycv-local";
  const s3 = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });

  // 1. Read template file
  const fileBuffer = fs.readFileSync(V2_PATH);
  console.log(`Read v2 template: ${fileBuffer.length} bytes`);

  // 2. Create or update the DB record (upsert by slug)
  const existing = await prisma.resumeTemplate.findFirst({
    where: { slug: V2_SLUG },
  });

  let templateId: string;
  if (existing) {
    templateId = existing.id;
    console.log(`Found existing record: ${templateId}`);
  } else {
    const created = await prisma.resumeTemplate.create({
      data: {
        name: "ATS Minimalista v2",
        slug: V2_SLUG,
        description:
          "Template ATS minimalista com suporte a idiomas PT/EN e seções customizadas",
        isActive: false,
      },
    });
    templateId = created.id;
    console.log(`Created new record: ${templateId}`);
  }

  // 3. Upload to MinIO
  const key = `templates/${templateId}/template.docx`;
  const endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
  const fileUrl = `${endpoint}/${bucket}/${key}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileBuffer,
      ContentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  console.log(`Uploaded to MinIO: ${fileUrl}`);

  // 4. Update DB record with fileUrl and activate
  await prisma.resumeTemplate.update({
    where: { id: templateId },
    data: { fileUrl, isActive: true },
  });
  console.log(`Updated DB record, isActive=true`);

  // 5. Deactivate v1
  const v1 = await prisma.resumeTemplate.findFirst({
    where: { slug: V1_SLUG },
  });
  if (v1) {
    await prisma.resumeTemplate.update({
      where: { id: v1.id },
      data: { isActive: false },
    });
    console.log(`Deactivated v1 (${v1.id})`);
  } else {
    console.log("v1 not found by slug — skipping deactivation");
  }

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
});
