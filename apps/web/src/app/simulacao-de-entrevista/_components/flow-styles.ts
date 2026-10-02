// Tokens das telas logadas da entrevista simulada (comprar / pedido), no
// mesmo padrão da landing: fundo branco, Ubuntu, serifa itálica nas ênfases.
export const SANS =
  'var(--font-ubuntu), -apple-system, "Segoe UI", system-ui, sans-serif';
export const MONO =
  'var(--font-ubuntu-mono), ui-monospace, "SF Mono", Menlo, monospace';
export const SERIF = "var(--font-instrument-serif), serif";

export const card: React.CSSProperties = {
  background: "#fafaf6",
  border: "1px solid rgba(10,10,10,0.08)",
  borderRadius: 16,
  boxShadow:
    "0 1px 2px rgba(0,0,0,0.04), 0 24px 60px -24px rgba(10,10,10,0.16)",
};

export const label: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  letterSpacing: 1.4,
  textTransform: "uppercase",
  color: "#8a8a85",
};

export const primaryButton: React.CSSProperties = {
  background: "#0a0a0a",
  color: "#fff",
  border: 0,
  borderRadius: 10,
  padding: "14px 22px",
  fontSize: 15,
  fontFamily: SANS,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  textDecoration: "none",
  cursor: "pointer",
  boxShadow:
    "0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
};
