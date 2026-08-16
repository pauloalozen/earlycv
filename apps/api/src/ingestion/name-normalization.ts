const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

// Planilhas de descoberta vem com nomes copiados de paginas web e as vezes
// trazem entidades HTML cruas (ex: "&#211;rama" em vez de "Órama") em vez do
// caractere acentuado — decodifica referencias numericas (decimal/hex) e as
// entidades nomeadas mais comuns antes de guardar/normalizar o nome.
export function decodeHtmlEntities(value: string) {
  return value.replace(
    /&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g,
    (match, entity: string) => {
      if (entity[0] === "#") {
        const codePoint =
          entity[1] === "x" || entity[1] === "X"
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10);
        return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
      }
      return NAMED_ENTITIES[entity] ?? match;
    },
  );
}

export function normalizeCompanyName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
