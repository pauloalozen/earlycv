"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveJob, unsaveJob } from "@/lib/saved-jobs-api";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

function useSaveJobToggle({
  jobId,
  initialSaved,
  isLoggedIn,
}: {
  jobId: string;
  initialSaved: boolean;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (!isLoggedIn) {
      router.push("/entrar?tab=cadastrar");
      return;
    }

    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const ok = next ? await saveJob(jobId) : await unsaveJob(jobId);
      if (!ok) {
        // Reverte estado otimista se a chamada falhar — não deixa o botão
        // "mentir" pro usuário sobre o que está salvo de verdade.
        setSaved(!next);
      }
    });
  }

  return { saved, pending, toggle };
}

// Botão icon-only, usado no card de vaga em /radar.
export function SaveJobBtn({
  jobId,
  initialSaved = false,
  isLoggedIn = true,
}: {
  jobId: string;
  initialSaved?: boolean;
  isLoggedIn?: boolean;
}) {
  const { saved, pending, toggle } = useSaveJobToggle({
    jobId,
    initialSaved,
    isLoggedIn,
  });

  return (
    <button
      type="button"
      aria-label={saved ? "Remover vaga salva" : "Salvar vaga"}
      aria-pressed={saved}
      onClick={toggle}
      disabled={pending}
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        background: saved ? "#0a0a0a" : "transparent",
        border: `1px solid ${saved ? "#0a0a0a" : "rgba(10,10,10,0.1)"}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.7 : 1,
      }}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={saved ? "#fafaf6" : "none"}
      >
        <title>{saved ? "Remover vaga salva" : "Salvar vaga"}</title>
        <path
          d="M6 3h12v18l-6-4-6 4V3z"
          stroke={saved ? "#fafaf6" : "#0a0a0a"}
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

// Botão texto+ícone, usado no card de candidatura em /radar/[slug].
export function SaveJobTextBtn({
  jobId,
  initialSaved = false,
  isLoggedIn = true,
}: {
  jobId: string;
  initialSaved?: boolean;
  isLoggedIn?: boolean;
}) {
  const { saved, pending, toggle } = useSaveJobToggle({
    jobId,
    initialSaved,
    isLoggedIn,
  });

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        background: "transparent",
        color: saved ? "#1f7a34" : "#6a6560",
        border: "none",
        padding: "8px",
        fontSize: 12,
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.7 : 1,
        fontFamily: GEIST,
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill={saved ? "#1f7a34" : "none"}
      >
        <title>{saved ? "Remover vaga salva" : "Salvar"}</title>
        <path
          d="M6 3h12v18l-6-4-6 4V3z"
          stroke={saved ? "#1f7a34" : "currentColor"}
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
      {saved ? "salva para depois" : "salvar para depois"}
    </button>
  );
}
