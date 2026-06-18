"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { DEMO_CV_ANALYSIS_MOCK } from "@/lib/demo-cv-analysis-mock";

export default function DemoResultadoPage() {
  const router = useRouter();

  useEffect(() => {
    sessionStorage.setItem(
      "guestAnalysis",
      JSON.stringify({
        adaptedContentJson: DEMO_CV_ANALYSIS_MOCK,
        previewText: DEMO_CV_ANALYSIS_MOCK.comparacao.depois,
        jobDescriptionText:
          "Engenheira de Dados Sênior — Nubank. Requisitos: Python, Airflow, dbt, Spark, Databricks, SQL, AWS S3, Data Lakehouse, Great Expectations.",
        masterCvText: DEMO_CV_ANALYSIS_MOCK.comparacao.antes,
      }),
    );
    router.replace("/adaptar/resultado?demo=1");
  }, [router]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "2px solid rgba(10,10,10,0.1)",
          borderTopColor: "#0a0a0a",
          animation: "spin 0.7s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
