"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createCvAdaptation } from "@/lib/cv-adaptation-api";
import type { ResumeTemplateDto } from "@/lib/resume-templates-api";
import { listResumeTemplates } from "@/lib/resume-templates-api";

export default function AdaptarPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ResumeTemplateDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listResumeTemplates()
      .then(setTemplates)
      .catch((err) => setError(`Failed to load templates: ${err.message}`));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();

      if (file) {
        formData.append("file", file);
      }

      formData.append("jobDescriptionText", jobDescription);
      if (jobTitle) formData.append("jobTitle", jobTitle);
      if (companyName) formData.append("companyName", companyName);
      if (selectedTemplateId) formData.append("templateId", selectedTemplateId);

      const adaptation = await createCvAdaptation(formData);
      router.push(`/adaptar/${adaptation.id}/resultado`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Adaptar CV para Vaga</h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Step 1: CV */}
          <div>
            <h2 className="text-xl font-semibold mb-4">1. Seu CV</h2>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                disabled={loading}
                className="hidden"
                id="file-input"
              />
              <label htmlFor="file-input" className="cursor-pointer">
                {file ? (
                  <div className="text-gray-700">
                    <p className="font-semibold">{file.name}</p>
                    <p className="text-sm text-gray-500">
                      ({(file.size / 1024).toFixed(0)} KB)
                    </p>
                  </div>
                ) : (
                  <div className="text-gray-600">
                    <p className="font-semibold mb-2">
                      Clique para selecionar seu CV em PDF
                    </p>
                    <p className="text-sm">Máximo 5 MB</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Step 2: Job Description */}
          <div>
            <h2 className="text-xl font-semibold mb-4">2. A Vaga</h2>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Cole aqui a descrição completa da vaga..."
              disabled={loading}
              required
              className="w-full h-32 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Título da vaga (opcional)"
              disabled={loading}
              className="w-full mt-2 p-2 border border-gray-300 rounded-lg"
            />
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Nome da empresa (opcional)"
              disabled={loading}
              className="w-full mt-2 p-2 border border-gray-300 rounded-lg"
            />
          </div>

          {/* Step 3: Template */}
          <div>
            <h2 className="text-xl font-semibold mb-4">3. Template</h2>
            <div className="grid grid-cols-1 gap-4">
              {templates.map((template) => (
                <label
                  key={template.id}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                    selectedTemplateId === template.id
                      ? "border-orange-500 bg-orange-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="template"
                    value={template.id}
                    checked={selectedTemplateId === template.id}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    disabled={loading}
                    className="mr-3"
                  />
                  <div className="inline-block">
                    <p className="font-semibold">{template.name}</p>
                    <p className="text-sm text-gray-600">
                      {template.description}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !jobDescription}
            className="w-full bg-orange-500 text-white font-semibold py-3 rounded-lg hover:bg-orange-600 disabled:bg-gray-400"
          >
            {loading ? "Analisando..." : "Analisar meu CV"}
          </button>
        </form>
      </div>
    </main>
  );
}
