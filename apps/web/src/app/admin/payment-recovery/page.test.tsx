import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  cleanup();
});

const listPendingMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/lib/admin-payment-recovery-api", () => ({
  listAdminPaymentRecoveryPending: (...args: unknown[]) => listPendingMock(...args),
}));

import AdminPaymentRecoveryPage from "./page";
import { RecoveryTableClient } from "./_components/recovery-table-client";
import type { RecoveryActionUiResult } from "./actions";

const baseItem = {
  purchaseId: "purchase-1",
  userId: "user-1",
  userName: "User One",
  userEmail: "user-1@earlycv.dev",
  originAction: "checkout",
  jobTitle: "Data Analyst",
  score: 82,
  hasAvailableCredits: false,
  ignored: false,
  alreadySent: false,
  eligibilityStatus: "eligible" as const,
  createdAt: "2026-05-01T00:00:00.000Z",
};

describe("AdminPaymentRecoveryPage", () => {
  beforeEach(() => {
    listPendingMock.mockReset();
    refreshMock.mockReset();
    listPendingMock.mockResolvedValue({
      items: [baseItem],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it("renders and requests default listing params", async () => {
    render(await AdminPaymentRecoveryPage({ searchParams: Promise.resolve({}) }));

    expect(await screen.findByText("Recuperacao de pedidos pendentes")).toBeInTheDocument();
    expect(listPendingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eligibilityStatus: "eligible",
        ignored: "false",
        pageSize: 20,
        page: 1,
      }),
    );
  });

  it("normalizes invalid page query values to page 1", async () => {
    render(
      await AdminPaymentRecoveryPage({
        searchParams: Promise.resolve({ page: "invalid" }),
      }),
    );

    expect(listPendingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
      }),
    );
  });

  it("wires filter and search params to listing query", async () => {
    render(
      await AdminPaymentRecoveryPage({
        searchParams: Promise.resolve({
          alreadySent: "true",
          dateFrom: "2026-05-01",
          dateTo: "2026-05-20",
          eligibilityStatus: "not_eligible",
          hasAvailableCredits: "false",
          ignored: "true",
          originAction: "checkout",
          search: "ana",
        }),
      }),
    );

    expect(listPendingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        alreadySent: "true",
        dateFrom: "2026-05-01",
        dateTo: "2026-05-20",
        eligibilityStatus: "not_eligible",
        hasAvailableCredits: "false",
        ignored: "true",
        originAction: "checkout",
        search: "ana",
      }),
    );
  });

  it("renders pagination links", async () => {
    listPendingMock.mockResolvedValue({
      items: [baseItem],
      total: 40,
      page: 2,
      limit: 20,
      totalPages: 3,
    });

    render(
      await AdminPaymentRecoveryPage({
        searchParams: Promise.resolve({ page: "2" }),
      }),
    );

    expect(await screen.findByRole("link", { name: /anterior/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /proxima/i })).toBeInTheDocument();
  });

  it("shows empty state when no pending orders are returned", async () => {
    listPendingMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    render(await AdminPaymentRecoveryPage({ searchParams: Promise.resolve({}) }));

    expect(
      await screen.findByText(/nenhum pedido pendente encontrado/i),
    ).toBeInTheDocument();
  });
});

describe("RecoveryTableClient actions", () => {
  afterEach(() => {
    cleanup();
  });

  it("enables send only for eligible and non-ignored rows", async () => {
    render(
      <RecoveryTableClient
        items={[
          baseItem,
          { ...baseItem, purchaseId: "purchase-2", eligibilityStatus: "not_eligible" as const },
          { ...baseItem, purchaseId: "purchase-3", ignored: true },
        ]}
        onIgnore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
        onSendEmail={vi.fn(async () => ({ kind: "success", message: "ok" }))}
        onUnignore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
      />,
    );

    const eligibleRow = (await screen.findAllByText("purchase-1"))[0].closest("tr");
    const notEligibleRow = (await screen.findAllByText("purchase-2"))[0].closest("tr");
    const ignoredRow = (await screen.findAllByText("purchase-3"))[0].closest("tr");

    expect(eligibleRow).toBeTruthy();
    expect(notEligibleRow).toBeTruthy();
    expect(ignoredRow).toBeTruthy();

    expect(
      within(eligibleRow as HTMLTableRowElement).getByRole("button", {
        name: /enviar email/i,
      }),
    ).toBeEnabled();
    expect(
      within(notEligibleRow as HTMLTableRowElement).getByRole("button", {
        name: /enviar email/i,
      }),
    ).toBeDisabled();
    expect(
      within(ignoredRow as HTMLTableRowElement).getByRole("button", {
        name: /enviar email/i,
      }),
    ).toBeDisabled();
  });

  it("opens send modal preview and calls send endpoint callback", async () => {
    const onSendEmail = vi.fn(
      async (_purchaseId: string, _forceResend?: boolean) => ({
        kind: "success" as const,
        message: "sent",
      }),
    );
    render(
      <RecoveryTableClient
        items={[baseItem]}
        onIgnore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
        onSendEmail={onSendEmail}
        onUnignore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
      />,
    );

    fireEvent.click((await screen.findAllByRole("button", { name: /enviar email/i }))[0]);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/dry-run ou com allowlist/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /confirmar envio/i }));

    await waitFor(() => {
      expect(onSendEmail).toHaveBeenCalledWith("purchase-1", false);
      expect(refreshMock).toHaveBeenCalled();
    });
  });

  it("asks confirmation before resending when email was already sent", async () => {
    const onSendEmail = vi.fn(
      async (_purchaseId: string, _forceResend?: boolean) => ({
        kind: "success" as const,
        message: "resent",
      }),
    );
    render(
      <RecoveryTableClient
        items={[{ ...baseItem, alreadySent: true }]}
        onIgnore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
        onSendEmail={onSendEmail}
        onUnignore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
      />,
    );

    fireEvent.click((await screen.findAllByRole("button", { name: /enviar email/i }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: /confirmar envio/i }));

    expect(await screen.findByText(/ja foi enviado anteriormente/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /reenviar mesmo assim/i }));

    await waitFor(() => {
      expect(onSendEmail).toHaveBeenCalledWith("purchase-1", true);
    });
  });

  it("prevents duplicate send submits while pending", async () => {
    let resolveSend: ((value: RecoveryActionUiResult) => void) | null = null;
    const onSendEmail = vi.fn(
      () =>
        new Promise<RecoveryActionUiResult>((resolve) => {
          resolveSend = resolve;
        }),
    );

    render(
      <RecoveryTableClient
        items={[baseItem]}
        onIgnore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
        onSendEmail={onSendEmail}
        onUnignore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
      />,
    );

    fireEvent.click((await screen.findAllByRole("button", { name: /enviar email/i }))[0]);
    const confirmButton = await screen.findByRole("button", {
      name: /confirmar envio/i,
    });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(confirmButton).toBeDisabled();
      expect(onSendEmail).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(confirmButton);
    expect(onSendEmail).toHaveBeenCalledTimes(1);

    resolveSend?.({ kind: "success", message: "sent" });
  });

  it("resets pending state and shows fallback error when callbacks reject", async () => {
    const onSendEmail = vi.fn(async () => {
      throw new Error("boom");
    });

    render(
      <RecoveryTableClient
        items={[baseItem]}
        onIgnore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
        onSendEmail={onSendEmail}
        onUnignore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
      />,
    );

    fireEvent.click((await screen.findAllByRole("button", { name: /enviar email/i }))[0]);
    const confirmButton = await screen.findByRole("button", {
      name: /confirmar envio/i,
    });
    fireEvent.click(confirmButton);

    expect(
      await screen.findByText(/nao foi possivel concluir a operacao/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /enviar email/i })).toBeEnabled();
    });
  });

  it("shows success and error result messages", async () => {
    const onSendEmail = vi
      .fn()
      .mockResolvedValueOnce({ kind: "success", message: "Email enviado com sucesso." })
      .mockResolvedValueOnce({ kind: "error", message: "Nao foi possivel enviar o email." });

    render(
      <RecoveryTableClient
        items={[baseItem]}
        onIgnore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
        onSendEmail={onSendEmail}
        onUnignore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
      />,
    );

    fireEvent.click((await screen.findAllByRole("button", { name: /enviar email/i }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: /confirmar envio/i }));
    expect(await screen.findByText(/email enviado com sucesso/i)).toBeInTheDocument();

    fireEvent.click((await screen.findAllByRole("button", { name: /enviar email/i }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: /confirmar envio/i }));
    expect(await screen.findByText(/nao foi possivel enviar o email/i)).toBeInTheDocument();
  });

  it("renders purchase date in a dedicated first column", async () => {
    render(
      <RecoveryTableClient
        items={[baseItem]}
        onIgnore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
        onSendEmail={vi.fn(async () => ({ kind: "success", message: "ok" }))}
        onUnignore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
      />,
    );

    const headers = await screen.findAllByRole("columnheader");
    expect(headers[0]).toHaveTextContent(/data pedido/i);
    expect(screen.getByText(/30\/04\/2026, 21:00/i)).toBeInTheDocument();
  });

  it("calls ignore and unignore callbacks", async () => {
    const onIgnore = vi.fn(async () => ({ kind: "success" as const, message: "ignored" }));
    const onUnignore = vi.fn(async () => ({ kind: "success" as const, message: "unignored" }));
    vi.spyOn(window, "prompt").mockReturnValue("manual");

    const { rerender } = render(
      <RecoveryTableClient
        items={[baseItem]}
        onIgnore={onIgnore}
        onSendEmail={vi.fn(async () => ({ kind: "success", message: "ok" }))}
        onUnignore={onUnignore}
      />,
    );

    fireEvent.click((await screen.findAllByRole("button", { name: /^Ignorar$/i }))[0]);
    await waitFor(() => expect(onIgnore).toHaveBeenCalledWith("purchase-1", "manual"));

    rerender(
      <RecoveryTableClient
        items={[{ ...baseItem, ignored: true }]}
        onIgnore={onIgnore}
        onSendEmail={vi.fn(async () => ({ kind: "success", message: "ok" }))}
        onUnignore={onUnignore}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /desfazer ignorar/i }));
    await waitFor(() => expect(onUnignore).toHaveBeenCalledWith("purchase-1"));
  });

  it("does not call ignore callback when ignore prompt is cancelled", async () => {
    const onIgnore = vi.fn(async () => ({ kind: "success" as const, message: "ignored" }));
    vi.spyOn(window, "prompt").mockReturnValue(null);

    render(
      <RecoveryTableClient
        items={[baseItem]}
        onIgnore={onIgnore}
        onSendEmail={vi.fn(async () => ({ kind: "success", message: "ok" }))}
        onUnignore={vi.fn(async () => ({ kind: "success", message: "ok" }))}
      />,
    );

    fireEvent.click((await screen.findAllByRole("button", { name: /^Ignorar$/i }))[0]);
    await waitFor(() => {
      expect(onIgnore).not.toHaveBeenCalled();
    });
  });
});
