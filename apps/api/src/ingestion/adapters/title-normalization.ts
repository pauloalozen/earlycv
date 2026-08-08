// Compartilhado entre GupyAdapter, GreenhouseAdapter e LeverAdapter — os
// tres tinham essa mesma funcao duplicada. Separadores comuns em titulo de
// vaga (`/`, `|`, `+`) precisam virar espaco antes do strip de pontuacao,
// senao "ETL/BI" vira "etlbi" e "Java+ Angular" vira "javaangular",
// fundindo dois tokens que o filtro semantico precisa enxergar separados.
export function normalizeAdapterTitle(value?: string | null) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[/|+]/g, " ")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
