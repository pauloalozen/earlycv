export type ExtractionFieldStatusValue = "filled" | "partial" | "missing";

export type MasterCvExtractionCoverageDto = {
  identifiedFields: string[];
  missingFields: string[];
  fieldStatus: Record<string, ExtractionFieldStatusValue>;
};

export type MasterCvExtractionStatusDto = {
  status: "pending" | "processing" | "succeeded" | "failed";
  extractionCoverage: MasterCvExtractionCoverageDto | null;
  updatedAt: string;
} | null;
