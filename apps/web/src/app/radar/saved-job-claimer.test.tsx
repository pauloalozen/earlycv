import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveJob: vi.fn(),
  getPendingSavedJob: vi.fn(),
  clearPendingSavedJob: vi.fn(),
}));

vi.mock("@/lib/saved-jobs-api", () => ({
  saveJob: mocks.saveJob,
}));
vi.mock("@/lib/saved-job-pending", () => ({
  getPendingSavedJob: mocks.getPendingSavedJob,
  clearPendingSavedJob: mocks.clearPendingSavedJob,
}));

import { SavedJobClaimer } from "./saved-job-claimer";

describe("SavedJobClaimer", () => {
  beforeEach(() => {
    mocks.saveJob.mockReset();
    mocks.getPendingSavedJob.mockReset();
    mocks.clearPendingSavedJob.mockReset();
  });

  afterEach(() => cleanup());

  it("sem pendência: não chama saveJob nem renderiza nada", () => {
    mocks.getPendingSavedJob.mockReturnValue(null);
    const { container } = render(<SavedJobClaimer />);

    expect(mocks.saveJob).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("com pendência: salva de verdade a vaga marcada antes do cadastro/login e limpa a pendência", async () => {
    mocks.getPendingSavedJob.mockReturnValue({
      jobId: "job-1",
      origin: "RADAR",
    });
    mocks.saveJob.mockResolvedValue(true);

    render(<SavedJobClaimer />);

    await waitFor(() => {
      expect(mocks.saveJob).toHaveBeenCalledWith("job-1", "RADAR");
    });
    expect(mocks.clearPendingSavedJob).toHaveBeenCalledTimes(1);
  });

  it("saveJob falha: limpa a pendência mesmo assim e mostra mensagem de erro", async () => {
    mocks.getPendingSavedJob.mockReturnValue({
      jobId: "job-1",
      origin: "MONITOR",
    });
    mocks.saveJob.mockResolvedValue(false);

    render(<SavedJobClaimer />);

    await waitFor(() => {
      expect(
        screen.getByText(/Não foi possível salvar a vaga/i),
      ).toBeInTheDocument();
    });
    expect(mocks.clearPendingSavedJob).toHaveBeenCalledTimes(1);
  });
});
