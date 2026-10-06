import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  updateEmailSettings: vi.fn(),
  previewEmailTemplate: vi.fn(),
  updateEmailTemplate: vi.fn(),
  resetEmailTemplate: vi.fn(),
  sendTestEmailTemplate: vi.fn(),
  recoverPurchaseConfirmations: vi.fn(),
}));
const revalidatePathMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/admin-emails-api", () => api);

import {
  previewEmailTemplateAction,
  recoverPurchaseConfirmationsAction,
  resetEmailTemplateAction,
  saveEmailTemplateAction,
  sendTestEmailTemplateAction,
  updateEmailSettingsAction,
} from "./actions";

function form(entries: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const IDLE = { status: "idle" as const, message: "" };

describe("emails admin actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("settings: converts the form (BRT cutoff -> ISO UTC, lines -> arrays, confirmLive checkbox) and revalidates", async () => {
    api.updateEmailSettings.mockResolvedValueOnce({});

    const result = await updateEmailSettingsAction(
      IDLE,
      form({
        welcomeMode: "LIVE",
        feedbackMode: "SHADOW",
        feedbackSecondCallMode: "SHADOW",
        purchaseConfirmationMode: "ALLOWLIST",
        mockInterviewOfferMode: "SHADOW",
        startAt: "2026-10-15T08:00",
        allowlist: "Tester@example.com\nmaria@example.com",
        extraBlocklist: "",
        confirmLive: "on",
      }),
    );

    expect(result).toEqual({
      status: "success",
      message: "Configurações salvas.",
    });
    expect(api.updateEmailSettings).toHaveBeenCalledWith({
      welcomeMode: "LIVE",
      feedbackMode: "SHADOW",
      feedbackSecondCallMode: "SHADOW",
      purchaseConfirmationMode: "ALLOWLIST",
      mockInterviewOfferMode: "SHADOW",
      startAt: "2026-10-15T11:00:00.000Z",
      allowlist: ["Tester@example.com", "maria@example.com"],
      extraBlocklist: [],
      confirmLive: true,
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/emails/configuracoes",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/emails");
  });

  it("settings: an unchecked confirmLive is false, an unknown mode falls back to OFF (never LIVE by accident), empty cutoff is null", async () => {
    api.updateEmailSettings.mockResolvedValueOnce({});

    await updateEmailSettingsAction(
      IDLE,
      form({
        welcomeMode: "EVERYONE",
        feedbackMode: "OFF",
        purchaseConfirmationMode: "OFF",
        startAt: "",
        allowlist: "",
        extraBlocklist: "",
      }),
    );

    expect(api.updateEmailSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        welcomeMode: "OFF",
        startAt: null,
        confirmLive: false,
      }),
    );
  });

  it("settings: a backend validation error comes back as STATE (the form keeps what was typed), nothing is revalidated", async () => {
    api.updateEmailSettings.mockRejectedValueOnce(
      new Error("Defina o cutoff (início) antes de ligar qualquer tipo."),
    );

    const result = await updateEmailSettingsAction(
      IDLE,
      form({ welcomeMode: "SHADOW" }),
    );

    expect(result).toEqual({
      status: "error",
      message: "Defina o cutoff (início) antes de ligar qualquer tipo.",
    });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("template save/reset/preview/send-test delegate to the API and surface errors as messages", async () => {
    api.updateEmailTemplate.mockResolvedValueOnce({});
    expect(
      await saveEmailTemplateAction("WELCOME", "Assunto", "Corpo"),
    ).toEqual({
      ok: true,
      message: "Template salvo.",
    });
    expect(api.updateEmailTemplate).toHaveBeenCalledWith("WELCOME", {
      subject: "Assunto",
      body: "Corpo",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/emails/templates");

    api.updateEmailTemplate.mockRejectedValueOnce(
      new Error("O feedback precisa ter exatamente uma pergunta"),
    );
    expect(
      await saveEmailTemplateAction("FEEDBACK_FIRST_USE", "a", "b"),
    ).toEqual({
      ok: false,
      message: "O feedback precisa ter exatamente uma pergunta",
    });

    api.resetEmailTemplate.mockResolvedValueOnce({});
    expect((await resetEmailTemplateAction("WELCOME")).ok).toBe(true);

    api.previewEmailTemplate.mockResolvedValueOnce({
      errors: ["x"],
      rendered: null,
    });
    expect(await previewEmailTemplateAction("WELCOME", "a", "b")).toEqual({
      ok: true,
      preview: { errors: ["x"], rendered: null },
    });
  });

  it("send-test requires ONE recipient and passes it through; the API result (incl. fake transport) is returned as is", async () => {
    expect(await sendTestEmailTemplateAction("WELCOME", "   ")).toEqual({
      ok: false,
      message: "Informe o e-mail do destinatário do teste.",
    });
    expect(api.sendTestEmailTemplate).not.toHaveBeenCalled();

    api.sendTestEmailTemplate.mockResolvedValueOnce({
      transport: "fake",
      sent: true,
      outcome: "SENT",
      dispatchId: "d1",
    });
    const result = await sendTestEmailTemplateAction(
      "WELCOME",
      " paulo.alozen@gmail.com ",
    );
    expect(api.sendTestEmailTemplate).toHaveBeenCalledWith(
      "WELCOME",
      "paulo.alozen@gmail.com",
    );
    expect(result).toEqual({
      ok: true,
      result: {
        transport: "fake",
        sent: true,
        outcome: "SENT",
        dispatchId: "d1",
      },
    });
  });

  it("recover purchase confirmations redirects with a success message (applied) or an explanation when the mode is OFF", async () => {
    api.recoverPurchaseConfirmations.mockResolvedValueOnce({
      applied: true,
      recovered: 2,
      missing: [{}, {}, {}],
      mode: "LIVE",
    });
    await expect(
      recoverPurchaseConfirmationsAction(form({ sinceHours: "24" })),
    ).rejects.toThrow(
      /NEXT_REDIRECT:\/admin\/emails\/compras\?status=success&message=2\+de\+3/,
    );
    expect(api.recoverPurchaseConfirmations).toHaveBeenCalledWith(24);

    api.recoverPurchaseConfirmations.mockResolvedValueOnce({
      applied: false,
      recovered: 0,
      missing: [],
      mode: "OFF",
    });
    await expect(recoverPurchaseConfirmationsAction(form({}))).rejects.toThrow(
      /status=success&message=Nada\+foi\+criado.*OFF/,
    );
  });

  it("recover purchase confirmations redirects with an error message when the API fails", async () => {
    api.recoverPurchaseConfirmations.mockRejectedValueOnce(new Error("boom"));
    await expect(
      recoverPurchaseConfirmationsAction(form({ sinceHours: "24" })),
    ).rejects.toThrow(/status=error&message=boom/);
  });
});
