export type AIProvider = "openai";

export type AIGenerationRequest = {
  input: string;
  metadata?: Record<string, string>;
  model: string;
  provider: AIProvider;
  systemPrompt?: string;
};

export type AIGenerationResult = {
  content: string;
  model: string;
  provider: AIProvider;
  usage?: {
    completionTokens?: number;
    promptTokens?: number;
    totalTokens?: number;
  };
};

export type AIAuditRecord = {
  candidateId?: string;
  createdAt: Date;
  jobId?: string;
  providerRequestId?: string;
  request: AIGenerationRequest;
  result?: AIGenerationResult;
  traceId: string;
};

export type OpenAIClientConfig = {
  apiKey: string;
  baseURL?: string;
  organization?: string;
  project?: string;
  timeout?: number;
};
