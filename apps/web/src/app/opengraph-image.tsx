import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "EarlyCV – Seu CV ajustado para cada vaga";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "80px 96px",
        background: "linear-gradient(135deg, #f9f8f4 0%, #e8e6de 100%)",
        position: "relative",
      }}
    >
      {/* Icon grid — logo mark */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          marginBottom: 40,
        }}
      >
        {/* Row 1 */}
        <div style={{ display: "flex", gap: 6 }}>
          <div
            style={{
              width: 60,
              height: 16,
              borderRadius: 6,
              background: "#0a0a0a",
            }}
          />
          <div
            style={{
              width: 48,
              height: 16,
              borderRadius: 6,
              background: "#0a0a0a",
            }}
          />
          <div
            style={{
              width: 40,
              height: 16,
              borderRadius: 6,
              background: "#c6ff3a",
            }}
          />
        </div>
        {/* Row 2 */}
        <div style={{ display: "flex", gap: 6 }}>
          <div
            style={{
              width: 68,
              height: 16,
              borderRadius: 6,
              background: "#c6ff3a",
            }}
          />
          <div
            style={{
              width: 96,
              height: 16,
              borderRadius: 6,
              background: "#0a0a0a",
            }}
          />
        </div>
        {/* Row 3 */}
        <div style={{ display: "flex", gap: 6 }}>
          <div
            style={{
              width: 36,
              height: 16,
              borderRadius: 6,
              background: "#0a0a0a",
            }}
          />
          <div
            style={{
              width: 68,
              height: 16,
              borderRadius: 6,
              background: "#c6ff3a",
            }}
          />
          <div
            style={{
              width: 40,
              height: 16,
              borderRadius: 6,
              background: "rgba(10,10,10,0.15)",
            }}
          />
        </div>
      </div>

      {/* Wordmark */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 0,
          marginBottom: 32,
        }}
      >
        <span
          style={{
            fontSize: 72,
            fontWeight: 300,
            color: "#0a0a0a",
            letterSpacing: -4,
          }}
        >
          early
        </span>
        <span
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: "#0a0a0a",
            letterSpacing: -4,
          }}
        >
          CV
        </span>
      </div>

      {/* Headline */}
      <div
        style={{
          fontSize: 40,
          fontWeight: 500,
          color: "#0a0a0a",
          letterSpacing: -1.5,
          lineHeight: 1.15,
          maxWidth: 800,
          marginBottom: 24,
        }}
      >
        Seu CV ajustado para cada vaga.
      </div>

      {/* Sub */}
      <div
        style={{
          fontSize: 22,
          color: "#45443e",
          fontWeight: 400,
          letterSpacing: -0.3,
        }}
      >
        Análise gratuita · ATS-friendly · Resultado imediato
      </div>

      {/* Domain badge */}
      <div
        style={{
          position: "absolute",
          bottom: 60,
          right: 96,
          fontSize: 18,
          fontWeight: 500,
          color: "#8a8a85",
          letterSpacing: 0.5,
        }}
      >
        earlycv.com.br
      </div>
    </div>,
    { ...size },
  );
}
