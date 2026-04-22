import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";
import PizZip from "pizzip";

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
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

  const templateId = getArg("--template-id");
  const slug = getArg("--slug");
  const needle = (getArg("--needle") ?? "IDIOMAS").toUpperCase();

  const template = await prisma.resumeTemplate.findFirst({
    where: {
      ...(templateId ? { id: templateId } : {}),
      ...(slug ? { slug } : {}),
      fileUrl: { not: null },
    },
    select: { id: true, slug: true, fileUrl: true },
  });

  if (!template?.fileUrl) {
    console.log("Template not found or missing fileUrl");
    await prisma.$disconnect();
    return;
  }

  const key = extractKeyFromUrl(template.fileUrl, bucket);
  const client = new S3Client({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: !!process.env.S3_ENDPOINT,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });

  const object = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
  const buffer = await readBodyToBuffer(object.Body);
  const zip = new PizZip(buffer);
  const xml = zip.file("word/document.xml")?.asText() ?? "";

  const upper = xml.toUpperCase();
  const idx = upper.indexOf(needle);
  const start = Math.max(0, idx - 1000);
  const end = idx >= 0 ? idx + 1400 : 2200;

  console.log(`template=${template.slug} (${template.id})`);
  console.log(`needle=${needle}, index=${idx}`);
  console.log(`has {#hasIdiomas}: ${xml.includes("{#hasIdiomas}")}`);
  console.log(`has {/hasIdiomas}: ${xml.includes("{/hasIdiomas}")}`);
  console.log(`has {#idiomas}: ${xml.includes("{#idiomas}")}`);
  console.log(`has {/idiomas}: ${xml.includes("{/idiomas}")}`);
  console.log("--- XML excerpt ---");
  console.log(xml.slice(start, end));

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
