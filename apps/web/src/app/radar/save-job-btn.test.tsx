import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveJob: vi.fn(),
  unsaveJob: vi.fn(),
  useRouter: vi.fn(),
  resolveJobProductOrigin: vi.fn(),
  setPendingSavedJob: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: mocks.useRouter }));
vi.mock("@/lib/saved-jobs-api", () => ({
  saveJob: mocks.saveJob,
  unsaveJob: mocks.unsaveJob,
}));
vi.mock("@/lib/journey-session", () => ({
  resolveJobProductOrigin: mocks.resolveJobProductOrigin,
}));
vi.mock("@/lib/saved-job-pending", () => ({
  setPendingSavedJob: mocks.setPendingSavedJob,
}));

import { SaveJobTextBtn } from "./save-job-btn";

describe("SaveJobTextBtn — origin resolved from the navigation that brought the user to this job", () => {
  beforeEach(() => {
    mocks.saveJob.mockReset();
    mocks.saveJob.mockResolvedValue(true);
    mocks.unsaveJob.mockReset();
    mocks.useRouter.mockReturnValue({ push: vi.fn() });
    mocks.resolveJobProductOrigin.mockReset();
    mocks.setPendingSavedJob.mockReset();
  });

  afterEach(() => cleanup());

  it("saves with origin=RADAR when the resolved product_origin is radar", async () => {
    mocks.resolveJobProductOrigin.mockReturnValue("radar");
    render(<SaveJobTextBtn jobId="job-1" />);

    fireEvent.click(screen.getByText("salvar para depois"));

    expect(mocks.saveJob).toHaveBeenCalledWith("job-1", "RADAR");
  });

  it("saves with origin=RADAR when the resolved product_origin is anything other than monitor/monitor_email (e.g. direct, seo_job)", async () => {
    mocks.resolveJobProductOrigin.mockReturnValue("seo_job");
    render(<SaveJobTextBtn jobId="job-1" />);

    fireEvent.click(screen.getByText("salvar para depois"));

    expect(mocks.saveJob).toHaveBeenCalledWith("job-1", "RADAR");
  });

  it("saves with origin=MONITOR when the resolved product_origin is monitor", async () => {
    mocks.resolveJobProductOrigin.mockReturnValue("monitor");
    render(<SaveJobTextBtn jobId="job-1" />);

    fireEvent.click(screen.getByText("salvar para depois"));

    expect(mocks.saveJob).toHaveBeenCalledWith("job-1", "MONITOR");
  });

  it("saves with origin=MONITOR when the resolved product_origin is monitor_email", async () => {
    mocks.resolveJobProductOrigin.mockReturnValue("monitor_email");
    render(<SaveJobTextBtn jobId="job-1" />);

    fireEvent.click(screen.getByText("salvar para depois"));

    expect(mocks.saveJob).toHaveBeenCalledWith("job-1", "MONITOR");
  });

  it("resolves the origin scoped to its own jobId", () => {
    mocks.resolveJobProductOrigin.mockReturnValue("radar");
    render(<SaveJobTextBtn jobId="job-42" />);

    expect(mocks.resolveJobProductOrigin).toHaveBeenCalledWith("job-42");
  });
});

describe("SaveJobTextBtn — visitante anônimo (bug real: a vaga não era salva depois do cadastro)", () => {
  const pushMock = vi.fn();

  beforeEach(() => {
    mocks.saveJob.mockReset();
    mocks.unsaveJob.mockReset();
    mocks.useRouter.mockReturnValue({ push: pushMock });
    pushMock.mockReset();
    mocks.resolveJobProductOrigin.mockReset();
    mocks.resolveJobProductOrigin.mockReturnValue("radar");
    mocks.setPendingSavedJob.mockReset();
  });

  afterEach(() => cleanup());

  it("guarda a intenção de salvar (jobId+origin) antes de redirecionar pro /entrar, nunca chama a API sem sessão", () => {
    render(<SaveJobTextBtn jobId="job-1" isLoggedIn={false} />);

    fireEvent.click(screen.getByText("salvar para depois"));

    expect(mocks.setPendingSavedJob).toHaveBeenCalledWith({
      jobId: "job-1",
      origin: "RADAR",
    });
    expect(mocks.saveJob).not.toHaveBeenCalled();
    expect(pushMock).toHaveBeenCalledWith("/entrar?tab=cadastrar&ctx=radar");
  });

  it("guarda origin=MONITOR quando a navegação veio do Alerta", () => {
    mocks.resolveJobProductOrigin.mockReturnValue("monitor");
    render(<SaveJobTextBtn jobId="job-2" isLoggedIn={false} />);

    fireEvent.click(screen.getByText("salvar para depois"));

    expect(mocks.setPendingSavedJob).toHaveBeenCalledWith({
      jobId: "job-2",
      origin: "MONITOR",
    });
  });
});
