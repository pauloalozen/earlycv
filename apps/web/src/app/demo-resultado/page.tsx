"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { EcvBuildLoader } from "@/components/ecv-loader";
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
    <div className="fixed inset-0 flex items-center justify-center bg-[#f0eee9]">
      <EcvBuildLoader size={48} />
    </div>
  );
}
