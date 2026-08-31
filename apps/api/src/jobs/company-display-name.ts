// Nomes vêm crus da ingestão (CSV, busca web) e ocasionalmente carregam
// aspas/pontuação solta coladas na palavra (ex: `"tivit`) — sem isso, o
// título ficaria com a aspa capitalizada em vez da letra real. Remove
// aspas retas/curvas e qualquer pontuação solta nas pontas de cada
// palavra, preservando acentos, "&", "-" e "." internos (ex: "AB InBev",
// "Even.io").
function stripStrayPunctuation(name: string): string {
  return name
    .replace(/["'“”‘’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Formata nome de empresa pra exibição pública (ex: marquee da landing) —
// primeira letra de cada palavra maiúscula, resto minúsculo. Isso não
// altera o dado salvo, só a apresentação.
export function formatCompanyDisplayName(name: string): string {
  return stripStrayPunctuation(name)
    .toLowerCase()
    .split(" ")
    .map((word) =>
      word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}
