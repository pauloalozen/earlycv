"use client";

import { useRef, useState } from "react";
import type { ResumeDto } from "@/lib/resumes-api";
import { deleteMasterResume, uploadMasterResume } from "@/lib/resumes-api";

const MONO = "var(--font-geist-mono), monospace";
const CARD: React.CSSProperties = {
  background: "#fafaf6",
  border: "1px solid rgba(10,10,10,0.08)",
  borderRadius: 14,
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type Props = { initialResume: ResumeDto | null };

export function CvMasterCard({ initialResume }: Props) {
  const [resume, setResume] = useState<ResumeDto | null>(initialResume);
  const [mode, setMode] = useState<"view" | "uploading" | "confirming-delete">(
    "view",
  );
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setError(null);
    try {
      const mf = new FormData();
      mf.append("file", pendingFile);
      mf.append("title", pendingFile.name.replace(/\.[^.]+$/, ""));
      mf.append("isPrimary", "true");
      const saved = await uploadMasterResume(mf);
      setResume(saved);
      setMode("view");
      setPendingFile(null);
    } catch {
      setError("Falha ao salvar o CV. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!resume) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteMasterResume(resume.id);
      setResume(null);
      setMode("view");
    } catch {
      setError("Falha ao remover o CV. Tente novamente.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section style={{ ...CARD, padding: "24px" }}>
      <p
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.2,
          color: "#8a8a85",
          fontWeight: 500,
          margin: "0 0 10px",
        }}
      >
        CV MASTER
      </p>

      {/* ── Upload inline (criar ou atualizar) ── */}
      {mode === "uploading" || (!resume && mode === "view") ? (
        <>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: -0.6,
              color: "#0a0a0a",
              margin: "0 0 4px",
            }}
          >
            {resume ? "Substituir CV base" : "Cadastre seu CV base"}
          </h2>
          <p
            style={{
              fontSize: 13.5,
              color: "#6a6560",
              margin: "0 0 16px",
              lineHeight: 1.5,
            }}
          >
            {resume
              ? "Escolha o novo arquivo PDF para substituir o atual."
              : "Evite subir seu currículo toda vez. Use um CV base para todas as análises."}
          </p>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: "100%",
              background: "rgba(10,10,10,0.03)",
              border: `1.5px dashed ${pendingFile ? "rgba(10,10,10,0.3)" : "rgba(10,10,10,0.15)"}`,
              borderRadius: 10,
              padding: "14px 16px",
              fontSize: 13,
              color: pendingFile ? "#0a0a0a" : "#8a8a85",
              cursor: "pointer",
              textAlign: "left",
              marginBottom: 10,
              fontFamily: "inherit",
            }}
          >
            {pendingFile ? `📄 ${pendingFile.name}` : "Selecionar PDF…"}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
          />

          {error && (
            <p style={{ color: "#ef4444", fontSize: 12, margin: "0 0 8px" }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleUpload}
              disabled={!pendingFile || uploading}
              style={{
                background: "#0a0a0a",
                color: "#fafaf6",
                border: "none",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 500,
                cursor: !pendingFile || uploading ? "default" : "pointer",
                opacity: !pendingFile || uploading ? 0.5 : 1,
                letterSpacing: -0.1,
              }}
              className="dash-btn-dark"
            >
              {uploading ? "Salvando…" : "Salvar CV"}
            </button>
            {resume && (
              <button
                type="button"
                onClick={() => {
                  setMode("view");
                  setPendingFile(null);
                  setError(null);
                }}
                style={{
                  background: "transparent",
                  color: "#0a0a0a",
                  border: "1px solid rgba(10,10,10,0.14)",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  letterSpacing: -0.1,
                }}
                className="dash-btn-outline"
              >
                Cancelar
              </button>
            )}
          </div>
        </>
      ) : mode === "confirming-delete" ? (
        /* ── Confirmação de exclusão ── */
        <>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: -0.5,
              color: "#0a0a0a",
              margin: "0 0 8px",
            }}
          >
            Remover CV base?
          </h2>
          <p
            style={{
              fontSize: 13.5,
              color: "#6a6560",
              margin: "0 0 16px",
              lineHeight: 1.5,
            }}
          >
            Você precisará subir um novo CV antes da próxima análise.
          </p>
          {error && (
            <p style={{ color: "#ef4444", fontSize: 12, margin: "0 0 8px" }}>
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              style={{
                background: "#ef4444",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 500,
                cursor: deleting ? "default" : "pointer",
                opacity: deleting ? 0.6 : 1,
                letterSpacing: -0.1,
              }}
            >
              {deleting ? "Removendo…" : "Sim, remover"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("view");
                setError(null);
              }}
              style={{
                background: "transparent",
                color: "#0a0a0a",
                border: "1px solid rgba(10,10,10,0.14)",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: -0.1,
              }}
              className="dash-btn-outline"
            >
              Cancelar
            </button>
          </div>
        </>
      ) : (
        /* ── Estado normal: CV existe ── */
        <>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: -0.6,
              color: "#0a0a0a",
              margin: "0 0 4px",
            }}
          >
            Seu CV base está pronto
          </h2>
          <p style={{ fontSize: 13.5, color: "#6a6560", margin: "0 0 16px" }}>
            Disponível para todas as análises
          </p>

          <div
            style={{
              background: "rgba(10,10,10,0.03)",
              border: "1px solid rgba(10,10,10,0.06)",
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 16,
            }}
          >
            <p
              style={{
                fontSize: 13.5,
                fontWeight: 500,
                color: "#0a0a0a",
                margin: "0 0 2px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {resume!.title}
            </p>
            {resume!.sourceFileName && (
              <p
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: "#8a8a85",
                  margin: "2px 0 0",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {resume!.sourceFileName}
              </p>
            )}
            <p
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                color: "#8a8a85",
                margin: "2px 0 0",
              }}
            >
              Atualizado em {formatDate(resume!.updatedAt)}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setMode("uploading")}
              style={{
                background: "#0a0a0a",
                color: "#fafaf6",
                border: "none",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: -0.1,
              }}
              className="dash-btn-dark"
            >
              Atualizar CV
            </button>
            <a
              href={`/api/resumes/${resume!.id}/download`}
              target="_blank"
              rel="noreferrer"
              style={{
                background: "transparent",
                color: "#0a0a0a",
                border: "1px solid rgba(10,10,10,0.14)",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
                letterSpacing: -0.1,
              }}
              className="dash-btn-outline"
            >
              Ver CV
            </a>
            <button
              type="button"
              onClick={() => setMode("confirming-delete")}
              style={{
                background: "transparent",
                color: "#c0392b",
                border: "1px solid rgba(192,57,43,0.2)",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: -0.1,
              }}
            >
              Eliminar CV
            </button>
          </div>
        </>
      )}
    </section>
  );
}
