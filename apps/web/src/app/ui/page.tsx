import type { Metadata } from "next";
import { MetricBar } from "@/components/ui/metric-bar";

export const metadata: Metadata = {
  title: "UI Showcase",
  description: "EarlyCV UI components showcase",
  robots: { index: false, follow: false },
};

export default function UIShowcase() {
  const segments = [
    { name: "skills", pct: 25, color: "green" as const },
    { name: "experience", pct: 30, color: "yellow" as const },
    { name: "culture fit", pct: 20, color: "red" as const },
    { name: "salary exp", pct: 25, color: "green" as const },
  ];

  return (
    <div className="min-h-screen bg-background py-12 px-4 md:px-8 lg:px-16">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-bold text-stone-900 mb-12 text-center">
          UI Components Showcase
        </h1>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="p-8 bg-white rounded-2xl shadow-sm border border-stone-200">
            <h2 className="text-2xl font-semibold mb-4 text-stone-900">
              Metric Bar
            </h2>
            <MetricBar score={72} segments={segments} />
          </div>
        </div>
      </div>
    </div>
  );
}
