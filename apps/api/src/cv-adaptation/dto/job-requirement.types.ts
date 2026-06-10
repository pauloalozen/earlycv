export type JobRequirementImportance = "high" | "medium" | "low";

export type RequirementCoverageStatus = "covered" | "partial" | "missing";

export type StructuredJobRequirement = {
  requirementKey: string;
  requirementText: string;
  importance: JobRequirementImportance;
};

export type JobRequirementCoverage = StructuredJobRequirement & {
  coverageStatus: RequirementCoverageStatus;
  evidence: string[];
  gapExplanation: string;
  recommendation: string;
  impactScore: number;
};

export type RequirementAdaptationAction = {
  requirementKey: string;
  action: "strengthened" | "preserved" | "not_addressed";
  whereChanged: string[];
  reason: string;
  truthfulnessRisk: "low" | "medium" | "high";
};
