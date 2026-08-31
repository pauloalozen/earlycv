"use client";

import Link from "next/link";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 13,
        height: 13,
        borderRadius: "50%",
        border: `2px solid ${dark ? "rgba(10,10,10,0.15)" : "rgba(250,250,246,0.3)"}`,
        borderTopColor: dark ? "#0a0a0a" : "#fafaf6",
        display: "inline-block",
        animation: "monitor-spin 0.8s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

// INITIALIZING: primeira vez que o Monitor deste usuário roda — nunca um
// "sem resultado" genérico. Skeleton de cards embaixo comunica "estamos
// trabalhando", não "não achamos nada".
export function MonitorInitializingBanner() {
  return (
    <div
      style={{
        background: "#0a0a0a",
        color: "#fafaf6",
        borderRadius: 14,
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        fontFamily: GEIST,
      }}
    >
      <style>{`@keyframes monitor-spin { to { transform: rotate(360deg); } }`}</style>
      <Spinner />
      <div>
        <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 500 }}>
          Estamos preparando seu Monitor
        </p>
        <p
          style={{ margin: 0, fontSize: 12.5, color: "rgba(250,250,246,0.65)" }}
        >
          Comparando seu perfil com as vagas recentes — isso leva só instantes.
        </p>
      </div>
    </div>
  );
}

// REFRESHING: nunca esconde os resultados já disponíveis — só uma faixa
// discreta acima do feed avisando que uma nova varredura está em curso
// (disparada por uma edição de perfil).
export function MonitorRefreshingBanner() {
  return (
    <div
      style={{
        background: "rgba(10,10,10,0.04)",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 10,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        gap: 9,
        fontFamily: GEIST,
      }}
    >
      <style>{`@keyframes monitor-spin { to { transform: rotate(360deg); } }`}</style>
      <Spinner dark />
      <span style={{ fontSize: 12.5, color: "#3a3a38" }}>
        Atualizando oportunidades com seu novo perfil
      </span>
    </div>
  );
}

export function MonitorSkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: count }, (_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: lista estática só de skeletons, sem identidade real
          key={i}
          aria-hidden
          style={{
            background: "#fafaf6",
            border: "1px solid rgba(10,10,10,0.06)",
            borderRadius: 14,
            padding: "18px 20px",
            height: 96,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: "rgba(10,10,10,0.06)",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div
              style={{
                width: "40%",
                height: 12,
                borderRadius: 4,
                background: "rgba(10,10,10,0.07)",
              }}
            />
            <div
              style={{
                width: "60%",
                height: 10,
                borderRadius: 4,
                background: "rgba(10,10,10,0.05)",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ACTIVE + items:[] — estado válido de produto, nunca preenchido
// artificialmente com oportunidades nível 0-2 nem substituído pela
// listagem do Radar.
export function MonitorEmptyActiveState({ onEdit }: { onEdit: () => void }) {
  return (
    <div
      style={{
        background: "#fafaf6",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 16,
        padding: "40px 28px",
        textAlign: "center",
        fontFamily: GEIST,
      }}
    >
      <p
        style={{
          margin: "0 0 6px",
          fontFamily: MONO,
          fontSize: 10.5,
          fontWeight: 500,
          letterSpacing: 1,
          color: "#2fa84c",
        }}
      >
        SEU MONITOR ESTÁ ATIVO
      </p>
      <p
        style={{
          margin: "0 auto 20px",
          fontSize: 14.5,
          color: "#5a5a55",
          maxWidth: 420,
        }}
      >
        Ainda não encontramos novas vagas dentro dos critérios definidos.
      </p>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={onEdit}
          style={{
            padding: "10px 16px",
            borderRadius: 9,
            border: "1px solid rgba(10,10,10,0.14)",
            background: "#fff",
            color: "#0a0a0a",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: GEIST,
            cursor: "pointer",
          }}
        >
          Revisar meu monitoramento
        </button>
        <Link
          href="/radar"
          style={{
            padding: "10px 16px",
            borderRadius: 9,
            border: "none",
            background: "#0a0a0a",
            color: "#fafaf6",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Explorar Radar de Oportunidades →
        </Link>
      </div>
    </div>
  );
}
