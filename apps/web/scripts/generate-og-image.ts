// Gera uma imagem PNG via modelo de imagem da OpenRouter e salva em apps/web/public.
// Uso: node --import tsx scripts/generate-og-image.ts <prompt> <output-relative-to-public> [--model=<slug>]
//
// Reaproveitável para qualquer necessidade futura de imagem estática (og:image de novas
// páginas, ilustrações de blog, etc.) — não é específico do og-default.png.
import fs from "node:fs";
import path from "node:path";

import OpenAI from "openai";

const DEFAULT_MODEL = "google/gemini-2.5-flash-image-preview";

function parseArgs(argv: string[]) {
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  const flags = Object.fromEntries(
    argv
      .filter((arg) => arg.startsWith("--"))
      .map((arg) => {
        const [key, ...rest] = arg.slice(2).split("=");
        return [key, rest.join("=")];
      }),
  );

  const [prompt, outputPath] = positional;
  if (!prompt || !outputPath) {
    throw new Error(
      "Uso: generate-og-image.ts <prompt> <output-relative-to-public> [--model=<slug>]",
    );
  }

  return { model: flags.model || DEFAULT_MODEL, outputPath, prompt };
}

async function main() {
  const { model, outputPath, prompt } = parseArgs(process.argv.slice(2));

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY não configurada no ambiente");
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    defaultHeaders: {
      ...(process.env.OPENROUTER_SITE_URL && {
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL,
      }),
      ...(process.env.OPENROUTER_SITE_NAME && {
        "X-Title": process.env.OPENROUTER_SITE_NAME,
      }),
    },
  });

  const completion = await client.chat.completions.create({
    messages: [{ content: prompt, role: "user" }],
    model,
    // biome-ignore lint/suspicious/noExplicitAny: campo de geração de imagem multimodal não faz parte do tipo padrão do SDK openai
    modalities: ["image", "text"],
  } as any);

  // biome-ignore lint/suspicious/noExplicitAny: shape específico da resposta de imagem da OpenRouter, fora do tipo padrão do SDK
  const message = completion.choices[0]?.message as any;
  const imageDataUrl: string | undefined = message?.images?.[0]?.image_url?.url;

  if (!imageDataUrl?.startsWith("data:image/")) {
    throw new Error(
      `Resposta sem imagem válida do modelo ${model}: ${JSON.stringify(message).slice(0, 500)}`,
    );
  }

  const base64 = imageDataUrl.slice(imageDataUrl.indexOf(",") + 1);
  const buffer = Buffer.from(base64, "base64");

  const publicDir = path.join(process.cwd(), "public");
  const absoluteOutputPath = path.join(publicDir, outputPath);
  fs.mkdirSync(path.dirname(absoluteOutputPath), { recursive: true });
  fs.writeFileSync(absoluteOutputPath, buffer);

  console.log(`Imagem salva em ${absoluteOutputPath} (${buffer.length} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
