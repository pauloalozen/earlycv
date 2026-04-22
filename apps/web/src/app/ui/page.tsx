import type { Metadata } from "next";
import { DeltaBadge, KeywordTable } from "@/components/ui";
import { MetricBar } from "@/components/ui/metric-bar";

export const metadata: Metadata = {
  title: "UI Showcase",
  description: "EarlyCV UI components showcase",
  robots: { index: false, follow: false },
};

export default function UIShowcase() {
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
            <MetricBar label="Fit score" value={72} />
          </div>
          <div className="p-8 bg-white rounded-2xl shadow-sm border border-stone-200">
            <h2 className="text-2xl font-semibold mb-4 text-stone-900">
              Delta Badge
            </h2>
            <div className="space-y-2">
              <DeltaBadge delta={5} />
              <DeltaBadge delta={-3} />
              <DeltaBadge delta={0} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
