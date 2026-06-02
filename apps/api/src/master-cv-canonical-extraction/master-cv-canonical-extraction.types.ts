export type MasterCvFilePayload = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

export type EnqueueMasterCvCanonicalExtractionInput = {
  userId: string;
  resumeId: string;
  file?: MasterCvFilePayload;
};

export type ProcessMasterCvCanonicalExtractionJobInput = {
  extractionId: string;
  file?: MasterCvFilePayload;
};

export type MasterCvCanonicalExtractionOutput = {
  canonicalProfile: {
    fullName: string | null;
    headline: string | null;
    email: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    location: {
      city: string | null;
      state: string | null;
      country: string | null;
    };
    professionalSummary: string | null;
    experiences: Array<{
      role: string | null;
      company: string | null;
      location: string | null;
      startDate: string | null;
      endDate: string | null;
      bullets: string[];
      technologies: string[];
    }>;
    education: Array<{
      institution: string | null;
      degree: string | null;
      fieldOfStudy: string | null;
      startDate: string | null;
      endDate: string | null;
    }>;
    skills: {
      technical: string[];
      business: string[];
      soft: string[];
    };
    languages: Array<{
      language: string;
      level: string | null;
    }>;
    certifications: Array<{
      name: string;
      issuer: string | null;
      year: string | null;
    }>;
  };
  extractionCoverage: {
    identifiedFields: string[];
    missingFields: string[];
    fieldStatus: Record<string, "filled" | "partial" | "missing">;
  };
  confidence: Record<string, number>;
  evidence: Record<string, string[]>;
};

export type ParsedMasterCvCanonicalExtractionPayload =
  MasterCvCanonicalExtractionOutput;
