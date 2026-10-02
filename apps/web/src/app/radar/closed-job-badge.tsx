const MONO = "var(--font-geist-mono), monospace";

// Selo de vaga que saiu do radar (fechada na fonte ou retirada). Calculado
// a partir do status atual da vaga — se ela reaparecer, o selo some sozinho.
export function isJobClosed(status: string | null | undefined) {
  return !!status && status !== "active";
}

// "tag": selo pequeno ao lado de título (cards do radar/Alerta).
// "pill": mesmo formato dos pills de status das candidaturas.
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
        gap: 5,
        background: "rgba(10,10,10,0.06)",
        color: "#3a3a38",
        border: "1px solid rgba(10,10,10,0.10)",
        fontFamily: MONO,
        fontSize: pill ? 10.5 : 9.5,
        padding: pill ? "3px 8px 3px 7px" : "2px 7px",
        borderRadius: pill ? 999 : 4,
        fontWeight: pill ? 500 : 600,
        letterSpacing: pill ? 0.3 : 0.4,
        lineHeight: pill ? 1 : undefined,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: "#a8a6a0",
        }}
      />
      {pill ? "VAGA ENCERRADA" : "Vaga encerrada"}
    </span>
  );
}
