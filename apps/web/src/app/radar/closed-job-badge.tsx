const MONO = "var(--font-geist-mono), monospace";

// Selo de vaga que saiu do radar (fechada na fonte ou retirada). Calculado
// a partir do status atual da vaga — se ela reaparecer, o selo some sozinho.
export function isJobClosed(status: string | null | undefined) {
  return !!status && status !== "active";
}

// "tag": selo pequeno ao lado de título (cards do radar/Alerta).
// "pill": formato dos pills de status das candidaturas, em destaque (preto
// com ponto vermelho) — é o aviso mais importante do card.
export function ClosedJobBadge({
  variant = "tag",
}: {
  variant?: "tag" | "pill";
}) {
  const pill = variant === "pill";
  return (
    <span
      title="Esta vaga saiu da página de carreiras da empresa"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: pill ? 6 : 5,
        background: pill ? "#0a0a0a" : "rgba(10,10,10,0.06)",
        color: pill ? "#fafaf6" : "#3a3a38",
        border: pill ? "1px solid #0a0a0a" : "1px solid rgba(10,10,10,0.10)",
        fontFamily: MONO,
        fontSize: pill ? 10.5 : 9.5,
        padding: pill ? "3px 8px 3px 7px" : "2px 7px",
        borderRadius: pill ? 999 : 4,
        fontWeight: 600,
        letterSpacing: pill ? 0.3 : 0.4,
        lineHeight: pill ? 1 : undefined,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          width: pill ? 6 : 5,
          height: pill ? 6 : 5,
          borderRadius: "50%",
          background: pill ? "#ef4444" : "#a8a6a0",
          boxShadow: pill ? "0 0 6px rgba(239,68,68,0.8)" : undefined,
          flexShrink: 0,
        }}
      />
      {pill ? "VAGA ENCERRADA" : "Vaga encerrada"}
    </span>
  );
}
