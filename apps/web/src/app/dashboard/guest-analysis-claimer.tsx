"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CvAnalysisData } from "@/lib/cv-adaptation-api";
import { claimGuestAnalysis } from "@/lib/cv-adaptation-api";

type GuestAnalysisStored = {
  adaptedContentJson: CvAnalysisData;
  previewText: string;
  jobDescriptionText: string;
  masterCvText: string;
};

type Props = {
  hasCredits: boolean | null;
};

export function GuestAnalysisClaimer({ hasCredits }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "claiming" | "done" | "error">(
    "idle",
  );

  useEffect(() => {
    const raw = sessionStorage.getItem("guestAnalysis");
    if (!raw) return;

    if (hasCredits !== true) {
      return;
    }

    let parsed: GuestAnalysisStored;
    try {
      parsed = JSON.parse(raw) as GuestAnalysisStored;
    } catch {
      sessionStorage.removeItem("guestAnalysis");
      return;
    }

    if (!parsed.masterCvText?.trim()) {
      sessionStorage.removeItem("guestAnalysis");
      return;
    }

    setStatus("claiming");

    claimGuestAnalysis({
      adaptedContentJson: parsed.adaptedContentJson as Record<string, unknown>,
      previewText: parsed.previewText,
      jobDescriptionText: parsed.jobDescriptionText,
      masterCvText: parsed.masterCvText,
      jobTitle: parsed.adaptedContentJson?.vaga?.cargo,
      companyName: parsed.adaptedContentJson?.vaga?.empresa,
    })
      .then(() => {
        sessionStorage.removeItem("guestAnalysis");
        setStatus("done");
        router.refresh();
      })
      .catch(() => {
        setStatus("error");
      });
  }, [hasCredits, router]);

  if (status === "idle" || status === "done") return null;

  if (status === "claiming") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-[#E8E8E8] bg-white px-5 py-3">
        <svg
          aria-hidden="true"
          className="animate-spin shrink-0 text-gray-400"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
        </svg>
        <p className="text-sm text-[#666666]">
          Salvando sua análise anterior...
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3">
        <p className="text-sm text-red-700">
          Não foi possível salvar a análise anterior. Tente analisar novamente.
        </p>
      </div>
    );
  }

  return null;
}
