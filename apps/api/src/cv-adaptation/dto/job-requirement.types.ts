export type JobRequirementImportance = "high" | "medium" | "low";

export type RequirementCoverageStatus = "covered" | "partial" | "missing";
export type RequirementCoveragePercent = 0 | 25 | 50 | 75 | 100;

export type JobRequirementDimension =
  | "experience"
  | "skill"
  | "education"
  | "certification"
  | "language"
  | "location"
  | "work_model"
  | "other";

export type JobRequirementGateLevel = "hard" | "soft";

export type StructuredJobRequirement = {
  requirementKey: string;
  requirementText: string;
  importance: JobRequirementImportance;
  dimension?: JobRequirementDimension;
  gateLevel?: JobRequirementGateLevel;
};

export type JobRequirementCoverage = StructuredJobRequirement & {
  coverageStatus: RequirementCoverageStatus;
  coveragePercent?: RequirementCoveragePercent;
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
