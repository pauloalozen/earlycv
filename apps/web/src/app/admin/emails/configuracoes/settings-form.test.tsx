import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sob carga (suíte inteira em paralelo) o padrão de 1s é curto para as
// transições assíncronas do React 19.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());

const actionMock = vi.hoisted(() => vi.fn());
vi.mock("../actions", () => ({ updateEmailSettingsAction: actionMock }));

import { EmailSettingsForm } from "./settings-form";

const initial = {
  welcomeMode: "OFF" as const,
  feedbackMode: "OFF" as const,
  purchaseConfirmationMode: "OFF" as const,
  startAtInput: "",
  allowlist: "",
  extraBlocklist: "",
};

describe("EmailSettingsForm", () => {
  beforeEach(() => {
    actionMock.mockReset();
    actionMock.mockResolvedValue({ status: "idle", message: "" });
  });

  it("starts with everything OFF and no LIVE confirmation box", () => {
    render(<EmailSettingsForm initial={initial} />);

    expect(screen.getByLabelText(/^Boas-vindas/)).toHaveValue("OFF");
    expect(screen.getByLabelText(/Feedback do primeiro uso/)).toHaveValue(
      "OFF",
    );
    expect(screen.getByLabelText(/Confirmação de compra/)).toHaveValue("OFF");
    expect(
      screen.queryByLabelText(/Confirmo que "Ao vivo"/),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Nada é criado nem enviado.")).toHaveLength(3);
  });

  it("selecting LIVE for any type reveals the explicit confirmation (and the per-mode help text)", () => {
    render(<EmailSettingsForm initial={initial} />);

    fireEvent.change(screen.getByLabelText(/^Boas-vindas/), {
      target: { value: "LIVE" },
    });

    expect(screen.getByLabelText(/Confirmo que "Ao vivo"/)).toBeInTheDocument();
    expect(
      screen.getByText(/Envia para todo elegível a partir do cutoff/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Boas-vindas/), {
      target: { value: "SHADOW" },
    });
    expect(
      screen.queryByLabelText(/Confirmo que "Ao vivo"/),
    ).not.toBeInTheDocument();
  });

  it("submits the typed values to the action", async () => {
    render(<EmailSettingsForm initial={initial} />);

    fireEvent.change(screen.getByLabelText(/^Boas-vindas/), {
      target: { value: "ALLOWLIST" },
    });
    fireEvent.change(screen.getByLabelText(/Cutoff/), {
      target: { value: "2026-10-15T08:00" },
    });
    fireEvent.change(screen.getByLabelText(/Allowlist/), {
      target: { value: "a@x.com\nb@y.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar configurações" }),
    );

    await waitFor(() => expect(actionMock).toHaveBeenCalledTimes(1));
    const [, formData] = actionMock.mock.calls[0] as [unknown, FormData];
    expect(formData.get("welcomeMode")).toBe("ALLOWLIST");
    expect(formData.get("feedbackMode")).toBe("OFF");
    expect(formData.get("startAt")).toBe("2026-10-15T08:00");
    expect(formData.get("allowlist")).toBe("a@x.com\nb@y.com");
  });

  it("a backend error is shown as an alert and the typed values are KEPT (no redirect, nothing wiped)", async () => {
    actionMock.mockResolvedValue({
      status: "error",
      message: "Defina o cutoff (início) antes de ligar qualquer tipo.",
    });
    render(<EmailSettingsForm initial={initial} />);

    fireEvent.change(screen.getByLabelText(/^Boas-vindas/), {
      target: { value: "SHADOW" },
    });
    fireEvent.change(screen.getByLabelText(/Allowlist/), {
      target: { value: "keep@me.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar configurações" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Defina o cutoff/,
    );
    expect(screen.getByLabelText(/^Boas-vindas/)).toHaveValue("SHADOW");
    expect(screen.getByLabelText(/Allowlist/)).toHaveValue("keep@me.com");
  });

  it("a successful save shows a status message", async () => {
    actionMock.mockResolvedValue({
      status: "success",
      message: "Configurações salvas.",
    });
    render(<EmailSettingsForm initial={initial} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Salvar configurações" }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Configurações salvas.",
    );
  });

  it("states the always-blocked accounts so nobody is surprised", () => {
    render(<EmailSettingsForm initial={initial} />);

    expect(
      screen.getByText(/paulo\.alozen@gmail\.com e contato@earlycv\.com\.br/),
    ).toBeInTheDocument();
  });
});
