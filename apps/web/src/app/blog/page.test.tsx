import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import BlogIndexPage from "./page";

describe("BlogIndexPage", () => {
  it("renders post titles, post hrefs and category chips in initial HTML", async () => {
    const page = await BlogIndexPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Currículo ATS: o que é");
    expect(html).toContain("href=\"/blog/curriculo-ats\"");
    expect(html).toContain("href=\"/blog/como-adaptar-curriculo-para-vaga\"");
    expect(html).toContain(">Todos<");
    expect(html).toContain(">Curriculo<");
  });
});
