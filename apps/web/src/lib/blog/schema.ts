import type { BlogFaqItem, BlogFrontmatter, BlogPostStatus } from "./types";

const REQUIRED_STRING_FIELDS = [
  "title",
  "description",
  "slug",
  "publishedAt",
  "updatedAt",
  "category",
  "readingTime",
  "seoTitle",
  "seoDescription",
] as const;

function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required field: ${field}`);
  }

  return value.trim();
}

function parseFaq(value: unknown): BlogFaqItem[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error("Missing required field: faq must be an array");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Missing required field: faq[${index}]`);
    }

    const entry = item as { answer?: unknown; question?: unknown };
    return {
      answer: assertString(entry.answer, `faq[${index}].answer`),
      question: assertString(entry.question, `faq[${index}].question`),
    };
  });
}

export function parseBlogFrontmatter(
  input: Record<string, unknown>,
): BlogFrontmatter {
  for (const field of REQUIRED_STRING_FIELDS) {
    assertString(input[field], field);
  }

  if (
    !Array.isArray(input.tags) ||
    input.tags.some((tag) => typeof tag !== "string")
  ) {
    throw new Error("Missing required field: tags");
  }

  if (typeof input.featured !== "boolean") {
    throw new Error("Missing required field: featured");
  }

  const status = input.status;
  if (status !== "published" && status !== "draft") {
    throw new Error("Missing required field: status");
  }

  return {
    category: assertString(input.category, "category"),
    coverImage:
      typeof input.coverImage === "string" && input.coverImage.trim().length > 0
        ? input.coverImage.trim()
        : undefined,
    description: assertString(input.description, "description"),
    faq: parseFaq(input.faq),
    featured: input.featured,
    mainTag:
      typeof input.mainTag === "string" && input.mainTag.trim().length > 0
        ? input.mainTag.trim()
        : undefined,
    publishedAt: assertString(input.publishedAt, "publishedAt"),
    readingTime: assertString(input.readingTime, "readingTime"),
    seoDescription: assertString(input.seoDescription, "seoDescription"),
    seoTitle: assertString(input.seoTitle, "seoTitle"),
    slug: assertString(input.slug, "slug"),
    status: status as BlogPostStatus,
    tags: input.tags.map((tag) => (tag as string).trim()).filter(Boolean),
    title: assertString(input.title, "title"),
    updatedAt: assertString(input.updatedAt, "updatedAt"),
  };
}
