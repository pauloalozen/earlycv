import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("not-found");
  }),
);

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

import BlogPostPage, {
  generateMetadata,
  generateStaticParams,
} from "./[slug]/page";

describe("blog pages", () => {
  it("includes only published slugs in static params", () => {
    const params = generateStaticParams();
    const slugs = params.map((item) => item.slug);

    expect(slugs).toContain("como-adaptar-curriculo-para-vaga");
    expect(slugs).not.toContain("rascunho-blog-exemplo");
  });

  it("calls notFound for unknown slug", async () => {
    await expect(
      BlogPostPage({ params: Promise.resolve({ slug: "slug-inexistente" }) }),
    ).rejects.toThrow("not-found");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("generates canonical metadata for published post", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "como-adaptar-curriculo-para-vaga" }),
    });

    expect(metadata.alternates?.canonical).toBe(
      "https://www.earlycv.com.br/blog/como-adaptar-curriculo-para-vaga",
    );
    expect(metadata.robots).toEqual({ follow: true, index: true });
    expect(metadata.title).toBeTypeOf("string");
  });

  it("renders first CTA after lead paragraph and keeps FAQ as final block", async () => {
    const page = await BlogPostPage({
      params: Promise.resolve({ slug: "como-adaptar-curriculo-para-vaga" }),
    });
    const html = renderToStaticMarkup(page);

    const leadIndex = html.indexOf('data-testid="blog-post-lead"');
    const firstCtaIndex = html.indexOf('data-testid="blog-post-top-cta"');
    const relatedIndex = html.indexOf('data-testid="blog-post-related"');
    const faqIndex = html.indexOf('data-testid="blog-post-faq"');
    const blogPostingIndex = html.indexOf('"@type":"BlogPosting"');
    const faqSchemaIndex = html.indexOf('"@type":"FAQPage"');

    expect(leadIndex).toBeGreaterThanOrEqual(0);
    expect(firstCtaIndex).toBeGreaterThan(leadIndex);
    expect(relatedIndex).toBeGreaterThanOrEqual(0);
    expect(faqIndex).toBeGreaterThan(relatedIndex);
    expect(blogPostingIndex).toBeGreaterThanOrEqual(0);
    expect(faqSchemaIndex).toBeGreaterThanOrEqual(0);
  });

  it("renders markdown semantics and scoped blog content class", async () => {
    const page = await BlogPostPage({
      params: Promise.resolve({ slug: "como-adaptar-curriculo-para-vaga" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('class="blog-content');
    expect(html).toContain("<h2>Passo 1: Leia a vaga com critério</h2>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>responsabilidades mais repetidas;</li>");
    expect(html).toContain('<a href="/blog/palavras-chave-curriculo">');
  });
});
