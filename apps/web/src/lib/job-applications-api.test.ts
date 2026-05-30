import { describe, expect, it, vi } from "vitest";

vi.mock("./api-request", () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from "./api-request";
import { splitJobApplicationAnalysis } from "./job-applications-api";

describe("splitJobApplicationAnalysis", () => {
  it("includes backend message details when split fails", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      ok: false,
      json: async () => ({ message: "adaptação já separada" }),
    } as Response);

    await expect(
      splitJobApplicationAnalysis("app-1", "adapt-1"),
    ).rejects.toThrow(
      "Falha ao separar análise em candidatura: adaptação já separada",
    );
  });
});
