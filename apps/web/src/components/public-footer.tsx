import Link from "next/link";

const footerSections = [
  {
    title: "Produto",
    links: [
      { href: "/adaptar", label: "Analise gratuita" },
      { href: "/adaptar-curriculo-para-vaga", label: "Adaptar curriculo" },
      { href: "/curriculo-ats", label: "Curriculo ATS" },
      {
        href: "/palavras-chave-curriculo",
        label: "Palavras-chave para curriculo",
      },
      { href: "/modelo-curriculo-ats", label: "Modelo de curriculo ATS" },
    ],
  },
  {
    title: "Aprender",
    links: [
      { href: "/blog", label: "Blog" },
      {
        href: "/blog/como-adaptar-curriculo-para-vaga",
        label: "Como adaptar curriculo para uma vaga",
      },
      { href: "/blog/curriculo-ats", label: "Guia de curriculo ATS" },
      {
        href: "/blog/palavras-chave-curriculo",
        label: "Palavras-chave no curriculo",
      },
      { href: "/curriculo-gupy", label: "Curriculo para Gupy" },
    ],
  },
  {
    title: "Recursos",
    links: [
      { href: "/demo-resultado", label: "Exemplo de analise" },
      { href: "/contato", label: "Contato" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacidade", label: "Privacidade" },
      { href: "/termos-de-uso", label: "Termos de uso" },
    ],
  },
] as const;

export function PublicFooter() {
  return (
    <footer className="mt-16 bg-[#0f0f10] text-stone-100">
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        <div className="mb-8 rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
          <p className="text-xl font-semibold tracking-tight">
            Pronto para melhorar seu curriculo?
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-stone-300">
            Compare seu curriculo com uma vaga e veja uma analise gratuita de
            compatibilidade em poucos minutos.
          </p>
          <Link
            href="/adaptar"
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-[#111111] sm:w-auto"
          >
            Analisar meu curriculo gratis
          </Link>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {footerSections.map((section) => (
            <div key={section.title}>
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-stone-300">
                {section.title}
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-stone-200">
                {section.links.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} className="hover:text-white">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-white/10 pt-4 text-xs text-stone-400 sm:flex-row sm:items-center sm:justify-between">
          <span>Dados protegidos conforme LGPD.</span>
          <span>EarlyCV © 2026</span>
        </div>
      </div>
    </footer>
  );
}
