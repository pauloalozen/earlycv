import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPushMock = vi.hoisted(() => vi.fn());
const routerPrefetchMock = vi.hoisted(() => vi.fn());
const emitBusinessFunnelEventMock = vi.hoisted(() => vi.fn());
const analyzeGuestCvMock = vi.hoisted(() => vi.fn());
const analyzeAuthenticatedCvMock = vi.hoisted(() => vi.fn());
const saveGuestPreviewMock = vi.hoisted(() => vi.fn());
const getAuthStatusMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    prefetch: routerPrefetchMock,
  }),
}));

vi.mock("@/components/app-header", () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));

vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/session-actions", () => ({
  getAuthStatus: getAuthStatusMock,
}));

vi.mock("@/lib/resumes-api", () => ({
  getMyMasterResume: vi.fn(async () => null),
}));

vi.mock("@/lib/cv-adaptation-api", () => ({
  analyzeAuthenticatedCv: analyzeAuthenticatedCvMock,
  analyzeGuestCv: analyzeGuestCvMock,
  emitBusinessFunnelEvent: emitBusinessFunnelEventMock,
  saveGuestPreview: saveGuestPreviewMock,
}));

import AdaptarPage from "./page";

describe("AdaptarPage submit analytics flow", () => {
  let turnstileCallback: ((token: string) => void) | null = null;

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    routerPushMock.mockReset();
    routerPrefetchMock.mockReset();
    emitBusinessFunnelEventMock.mockReset();
    analyzeGuestCvMock.mockReset();
    analyzeAuthenticatedCvMock.mockReset();
    saveGuestPreviewMock.mockReset();
    getAuthStatusMock.mockReset();
    getAuthStatusMock.mockResolvedValue({ userName: null });
    emitBusinessFunnelEventMock.mockResolvedValue(undefined);
    analyzeGuestCvMock.mockResolvedValue({ adaptationId: "adapt-1" });
    analyzeAuthenticatedCvMock.mockResolvedValue({
      adaptedContentJson: {
        vaga: { cargo: "", empresa: "" },
      },
      previewText: "",
      masterCvText: "master-cv",
    });
    saveGuestPreviewMock.mockResolvedValue({ id: "saved-1" });
    sessionStorage.clear();
    turnstileCallback = null;
  });

  it("requests invisible turnstile token on submit and appends it to FormData", async () => {
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "site-key-1");

    const turnstileRenderMock = vi.fn(
      (
        _container: HTMLElement,
        options: { callback?: (token: string) => void },
      ) => {
        turnstileCallback = options.callback ?? null;
        return "widget-1";
      },
    );
    const turnstileExecuteMock = vi.fn(() => {
      turnstileCallback?.("generated-token-1");
    });

    vi.stubGlobal("turnstile", {
      render: turnstileRenderMock,
      execute: turnstileExecuteMock,
      reset: vi.fn(),
    });

    const { container } = render(<AdaptarPage />);

    const textarea = await screen.findByPlaceholderText(
      "Cole a vaga completa (isso melhora sua análise)...",
    );
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]');

    if (!fileInput) {
      throw new Error("Expected file input to exist");
    }

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["cv"], "cv.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.change(textarea, {
      target: { value: "Descricao da vaga" },
    });

    const submitButton = screen.getAllByRole("button", {
      name: /Descobrir meus erros no CV/i,
    })[0];
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(analyzeGuestCvMock).toHaveBeenCalledTimes(1);
    });

    expect(turnstileRenderMock).toHaveBeenCalledTimes(1);
    expect(turnstileRenderMock.mock.calls[0]?.[1]).toMatchObject({
      appearance: "execute",
      execution: "execute",
      size: "normal",
    });
    expect(turnstileExecuteMock).toHaveBeenCalledTimes(1);

    const formDataArg = analyzeGuestCvMock.mock.calls[0]?.[0] as
      | FormData
      | undefined;
    expect(formDataArg).toBeInstanceOf(FormData);
    expect(formDataArg?.get("turnstileToken")).toBe("generated-token-1");
  });

  it("keeps submit flow working without turnstile site key", async () => {
    const turnstileExecuteMock = vi.fn();
    vi.stubGlobal("turnstile", {
      render: vi.fn(() => "widget-1"),
      execute: turnstileExecuteMock,
      reset: vi.fn(),
    });

    const { container } = render(<AdaptarPage />);

    const textarea = await screen.findByPlaceholderText(
      "Cole a vaga completa (isso melhora sua análise)...",
    );
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]');

    if (!fileInput) {
      throw new Error("Expected file input to exist");
    }

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["cv"], "cv.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.change(textarea, {
      target: { value: "Descricao da vaga" },
    });

    const submitButton = screen.getAllByRole("button", {
      name: /Descobrir meus erros no CV/i,
    })[0];
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(analyzeGuestCvMock).toHaveBeenCalledTimes(1);
    });

    expect(turnstileExecuteMock).not.toHaveBeenCalled();
    const formDataArg = analyzeGuestCvMock.mock.calls[0]?.[0] as
      | FormData
      | undefined;
    expect(formDataArg?.get("turnstileToken")).toBeNull();
  });

  it("emits analyze_submit_clicked but not analysis_started for guest submit without file", async () => {
    render(<AdaptarPage />);

    const textarea = await screen.findByPlaceholderText(
      "Cole a vaga completa (isso melhora sua análise)...",
    );

    emitBusinessFunnelEventMock.mockClear();

    fireEvent.change(textarea, {
      target: { value: "Descricao da vaga" },
    });
    const submitButton = screen.getAllByRole("button", {
      name: /Descobrir meus erros no CV/i,
    })[0];
    fireEvent.click(submitButton);

    await waitFor(() => {
      const eventNames = emitBusinessFunnelEventMock.mock.calls.map(
        ([payload]) => payload.eventName,
      );
      expect(eventNames).toContain("analyze_submit_clicked");
      expect(eventNames).not.toContain("analysis_started");
    });
  });

  it("emits analysis_started once and before guest analyze request on valid submit", async () => {
    const order: string[] = [];
    emitBusinessFunnelEventMock.mockImplementation(async (payload) => {
      if (payload.eventName === "analysis_started") {
        order.push("analysis_started");
      }
      return undefined;
    });
    analyzeGuestCvMock.mockImplementation(async () => {
      order.push("analyze_request");
      return { adaptationId: "adapt-2" };
    });

    const { container } = render(<AdaptarPage />);

    const textarea = await screen.findByPlaceholderText(
      "Cole a vaga completa (isso melhora sua análise)...",
    );
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]');

    if (!fileInput) {
      throw new Error("Expected file input to exist");
    }

    emitBusinessFunnelEventMock.mockClear();

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["cv"], "cv.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.change(textarea, {
      target: { value: "Descricao da vaga" },
    });
    const submitButton = screen.getAllByRole("button", {
      name: /Descobrir meus erros no CV/i,
    })[0];
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(analyzeGuestCvMock).toHaveBeenCalledTimes(1);
    });

    const analysisStartedCalls = emitBusinessFunnelEventMock.mock.calls.filter(
      ([payload]) => payload.eventName === "analysis_started",
    );

    expect(analysisStartedCalls).toHaveLength(1);
    expect(order.indexOf("analysis_started")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("analyze_request")).toBeGreaterThanOrEqual(0);
    expect(order.indexOf("analysis_started")).toBeLessThan(
      order.indexOf("analyze_request"),
    );
  });

  it("persists authenticated analysis before navigating to resultado", async () => {
    getAuthStatusMock.mockResolvedValue({ userName: "Claudio" });

    const { container } = render(<AdaptarPage />);

    const textarea = await screen.findByPlaceholderText(
      "Cole a vaga completa (isso melhora sua análise)...",
    );
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]');

    if (!fileInput) {
      throw new Error("Expected file input to exist");
    }

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["cv"], "cv.pdf", { type: "application/pdf" })],
      },
    });
    fireEvent.change(textarea, {
      target: { value: "Descricao da vaga" },
    });

    const submitButton = screen.getAllByRole("button", {
      name: /Descobrir meus erros no CV/i,
    })[0];
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(analyzeAuthenticatedCvMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(
      () => {
        expect(saveGuestPreviewMock).toHaveBeenCalledTimes(1);
      },
      { timeout: 15000 },
    );

    const analyzeFormData = analyzeAuthenticatedCvMock.mock.calls[0]?.[0] as
      | FormData
      | undefined;
    expect(analyzeFormData?.get("saveAsMaster")).toBe("true");

    expect(routerPushMock).toHaveBeenCalledWith(
      "/adaptar/resultado?adaptationId=saved-1",
    );
  }, 20000);
});
