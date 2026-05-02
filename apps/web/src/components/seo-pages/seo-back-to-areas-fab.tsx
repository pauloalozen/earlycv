export function SeoBackToAreasFab() {
  return (
    <a
      aria-label="Voltar para escolha de area"
      className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-full border border-black bg-black px-4 py-2 text-xs font-semibold text-white shadow-lg hover:bg-stone-900 md:bottom-6 md:right-6"
      href="#areas"
      style={{ color: "#ffffff" }}
    >
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m18 15-6-6-6 6" />
      </svg>
      Voltar para areas
    </a>
  );
}
