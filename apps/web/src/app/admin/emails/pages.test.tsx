import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(() => cleanup());

const api = vi.hoisted(() => ({
  getEmailsOverview: vi.fn(),
  getEmailSettings: vi.fn(),
  listEmailTemplates: vi.fn(),
  listEmailDispatches: vi.fn(),
  getEmailDispatch: vi.fn(),
  listEmailSuppressions: vi.fn(),
  getMissingPurchaseConfirmations: vi.fn(),
}));
const tokenMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin-emails-api", () => api);
vi.mock("@/lib/backoffice-session.server", () => ({
  getBackofficeSessionToken: tokenMock,
}));
vi.mock("./actions", () => ({
  recoverPurchaseConfirmationsAction: vi.fn(),
  updateEmailSettingsAction: vi.fn(),
  previewEmailTemplateAction: vi.fn(),
  saveEmailTemplateAction: vi.fn(),
  resetEmailTemplateAction: vi.fn(),
  sendTestEmailTemplateAction: vi.fn(),
}));

import PurchasesPage from "./compras/page";
import SettingsPage from "./configuracoes/page";
import DispatchDetailPage from "./envios/[id]/page";
import OverviewPage from "./page";
import RelationshipPage from "./relacionamento/page";
import SuppressionsPage from "./supressoes/page";
import TemplatesPage from "./templates/page";

const settings = {
  welcomeMode: "SHADOW",
  feedbackMode: "OFF",
  purchaseConfirmationMode: "ALLOWLIST",
  startAt: "2026-10-15T11:00:00.000Z",
  allowlist: ["a@x.com"],
  extraBlocklist: [],
  updatedAt: "2026-10-14T12:00:00.000Z",
  updatedByAdminId: "admin_1",
};

const overview = (overrides: Record<string, unknown> = {}) => ({
  settings,
  runtime: {
    transport: "fake",
    effectiveModes: {
      WELCOME: "SHADOW",
      FEEDBACK_FIRST_USE: "OFF",
      PURCHASE_CONFIRMATION: "ALLOWLIST",
    },
    relationshipReadiness: { ready: true },
    purchaseReadiness: { ready: false, reason: "resend_not_configured" },
  },
  counts: {
    windowDays: 30,
    byKindStatus: [
      { kind: "WELCOME", status: "SENT", count: 7 },
      { kind: "WELCOME", status: "SKIPPED", count: 3 },
    ],
    eventsWindowDays: 7,
    events: [{ type: "DELIVERED", count: 5 }],
    suppressions: [{ reason: "HARD_BOUNCE", count: 2 }],
    missingPurchaseConfirmations: 1,
  },
  ...overrides,
});

const dispatchItem = (overrides: Record<string, unknown> = {}) => ({
  id: "disp_1",
  kind: "WELCOME",
  status: "SKIPPED",
  skippedReason: "shadow_mode",
  variant: null,
  recipientEmail: "maria@example.com",
  scheduledFor: "2026-10-15T12:00:00.000Z",
  sentAt: null,
  attempts: 0,
  lastError: null,
  provider: "SES",
  isTest: false,
  referenceId: null,
  createdAt: "2026-10-15T11:50:00.000Z",
  ...overrides,
});

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  tokenMock.mockReset();
  tokenMock.mockResolvedValue("token");
});

describe("Emails pages without a session / on API failure", () => {
  it("every page shows the standard missing-token state (and never calls the API) without a backoffice token", async () => {
    tokenMock.mockResolvedValue(null);
    const sp = Promise.resolve({});
    const pages = [
      () => OverviewPage(),
      () => RelationshipPage({ searchParams: sp }),
      () => PurchasesPage({ searchParams: sp }),
      () => SuppressionsPage({ searchParams: sp }),
      () => SettingsPage(),
      () => TemplatesPage({ searchParams: sp }),
      () => DispatchDetailPage({ params: Promise.resolve({ id: "x" }) }),
    ];
    for (const page of pages) {
      const { unmount } = render(await page());
      unmount();
    }
    for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
  });

  it("an API failure renders the unexpected-error state, not a crash", async () => {
    api.getEmailsOverview.mockRejectedValue(new Error("boom"));
    render(await OverviewPage());
    expect(screen.queryByText("Visão geral")).not.toBeInTheDocument();
  });
});

describe("Overview", () => {
  it("shows the fake-transport notice, per-type mode, cutoff, readiness reasons, counts and health", async () => {
    api.getEmailsOverview.mockResolvedValue(overview());

    render(await OverviewPage());

    expect(screen.getByText(/Transporte fake/)).toBeInTheDocument();
    expect(screen.getAllByText("Boas-vindas").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sombra (não envia)").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/só cadastros\/compras a partir de/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Relacionamento \(SES\)/)).toBeInTheDocument();
    expect(screen.getByText(/RESEND_API_KEY ausente/)).toBeInTheDocument();
    // contagens por tipo/status e saúde
    const welcomeRow = screen
      .getByText("Boas-vindas", { selector: "td" })
      .closest("tr") as HTMLElement;
    expect(within(welcomeRow).getByText("7")).toBeInTheDocument();
    expect(screen.getByText("Compras sem recibo (24h)")).toBeInTheDocument();
    expect(screen.getByText("Endereços suprimidos")).toBeInTheDocument();
  });

  it("with no cutoff it says nothing runs; real transport shows the production notice", async () => {
    api.getEmailsOverview.mockResolvedValue(
      overview({
        settings: { ...settings, startAt: null },
        runtime: {
          transport: "real",
          effectiveModes: {
            WELCOME: "OFF",
            FEEDBACK_FIRST_USE: "OFF",
            PURCHASE_CONFIRMATION: "OFF",
          },
          relationshipReadiness: { ready: true },
          purchaseReadiness: { ready: true },
        },
      }),
    );

    render(await OverviewPage());

    expect(
      screen.getByText(/não definido — nenhum envio roda/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Transporte real \(produção\)/),
    ).toBeInTheDocument();
  });

  it("flags when the configured mode differs from the effective one", async () => {
    api.getEmailsOverview.mockResolvedValue(
      overview({
        settings: { ...settings, welcomeMode: "LIVE" },
        runtime: {
          transport: "fake",
          effectiveModes: {
            WELCOME: "ALLOWLIST",
            FEEDBACK_FIRST_USE: "OFF",
            PURCHASE_CONFIRMATION: "OFF",
          },
          relationshipReadiness: { ready: true },
          purchaseReadiness: { ready: true },
        },
      }),
    );

    render(await OverviewPage());

    expect(
      screen.getByText(/Configurado como Ao vivo; efetivo Só allowlist/),
    ).toBeInTheDocument();
  });
});

describe("Relationship / Purchases / Suppressions / Detail", () => {
  it("relationship lists only the relationship group, applies valid filters and ignores unknown ones", async () => {
    api.listEmailDispatches.mockResolvedValue({
      items: [dispatchItem()],
      total: 1,
      page: 1,
      limit: 25,
    });

    render(
      await RelationshipPage({
        searchParams: Promise.resolve({
          page: "2",
          kind: "FEEDBACK_FIRST_USE",
          status: "HACK",
        }),
      }),
    );

    expect(api.listEmailDispatches).toHaveBeenCalledWith(
      {
        page: 2,
        limit: 25,
        group: "relationship",
        kind: "FEEDBACK_FIRST_USE",
        status: undefined,
      },
      "token",
    );
    expect(screen.getByText("maria@example.com")).toBeInTheDocument();
    expect(screen.getByText("Modo sombra (não envia)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir" })).toHaveAttribute(
      "href",
      "/admin/emails/envios/disp_1",
    );
  });

  it("relationship shows an explanatory empty state", async () => {
    api.listEmailDispatches.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 25,
    });

    render(await RelationshipPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByText(/Com os modos desligados \(padrão\) nada é criado/),
    ).toBeInTheDocument();
  });

  it("purchases: shows the missing-confirmation block with the recover button, and the purchase group listing", async () => {
    api.listEmailDispatches.mockResolvedValue({
      items: [
        dispatchItem({
          kind: "PURCHASE_CONFIRMATION",
          status: "SENT",
          skippedReason: null,
        }),
      ],
      total: 1,
      page: 1,
      limit: 25,
    });
    api.getMissingPurchaseConfirmations.mockResolvedValue({
      sinceHours: 24,
      count: 2,
      items: [
        {
          purchaseId: "p1",
          userId: "u1",
          planType: "pro",
          completedAt: "2026-10-15T10:00:00.000Z",
        },
        {
          purchaseId: "p2",
          userId: "u2",
          planType: "starter",
          completedAt: "2026-10-15T11:00:00.000Z",
        },
      ],
    });

    render(await PurchasesPage({ searchParams: Promise.resolve({}) }));

    expect(api.listEmailDispatches).toHaveBeenCalledWith(
      expect.objectContaining({ group: "purchase" }),
      "token",
    );
    expect(
      screen.getByText(/2 compra\(s\) concluída\(s\) sem linha de confirmação/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Recriar confirmações faltantes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("p1")).toBeInTheDocument();
  });

  it("purchases: with nothing missing there is no recover button; redirect feedback is shown", async () => {
    api.listEmailDispatches.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 25,
    });
    api.getMissingPurchaseConfirmations.mockResolvedValue({
      sinceHours: 24,
      count: 0,
      items: [],
    });

    render(
      await PurchasesPage({
        searchParams: Promise.resolve({
          status: "success",
          message: "2 de 3 recriadas",
        }),
      }),
    );

    expect(
      screen.queryByRole("button", { name: "Recriar confirmações faltantes" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("2 de 3 recriadas")).toBeInTheDocument();
    expect(
      screen.getByText(/Nenhuma compra concluída nas últimas 24h/),
    ).toBeInTheDocument();
  });

  it("suppressions: lists address, reason and origin; explains that temporary bounces never enter", async () => {
    api.listEmailSuppressions.mockResolvedValue({
      items: [
        {
          id: "s1",
          email: "bad@example.com",
          reason: "HARD_BOUNCE",
          bounceSubType: "General",
          sourceCategory: "JOB_ALERT",
          occurredAt: "2026-10-15T10:00:00.000Z",
        },
        {
          id: "s2",
          email: "angry@example.com",
          reason: "COMPLAINT",
          bounceSubType: null,
          sourceCategory: null,
          occurredAt: "2026-10-15T10:00:00.000Z",
        },
      ],
      total: 2,
      page: 1,
      limit: 25,
    });

    render(await SuppressionsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("bad@example.com")).toBeInTheDocument();
    expect(screen.getByText("Hard bounce")).toBeInTheDocument();
    expect(screen.getByText("Complaint")).toBeInTheDocument();
    expect(screen.getByText("JOB_ALERT")).toBeInTheDocument();
    expect(
      screen.getByText(/Bounce temporário nunca entra aqui/),
    ).toBeInTheDocument();
  });

  it("dispatch detail: fields and the delivery timeline; back link depends on the kind", async () => {
    api.getEmailDispatch.mockResolvedValue({
      ...dispatchItem({
        kind: "PURCHASE_CONFIRMATION",
        status: "SENT",
        skippedReason: null,
        referenceId: "p1",
      }),
      expiresAt: "2026-10-16T11:50:00.000Z",
      providerMessageId: "m-1",
      events: [
        { id: "e1", type: "DELIVERED", occurredAt: "2026-10-15T12:01:00.000Z" },
      ],
    });

    render(
      await DispatchDetailPage({ params: Promise.resolve({ id: "disp_1" }) }),
    );

    expect(screen.getByText("Confirmação de compra")).toBeInTheDocument();
    expect(screen.getByText("m-1")).toBeInTheDocument();
    expect(screen.getByText("Entregue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← Voltar" })).toHaveAttribute(
      "href",
      "/admin/emails/compras",
    );
  });
});

describe("Settings and Templates pages", () => {
  it("settings: initial values reach the form — cutoff shown in Brasília time, lists one per line, 'last changed' note", async () => {
    api.getEmailSettings.mockResolvedValue(settings);

    render(await SettingsPage());

    expect(screen.getByLabelText(/Cutoff \(horário de Brasília\)/)).toHaveValue(
      "2026-10-15T08:00",
    );
    expect(screen.getByLabelText(/Allowlist/)).toHaveValue("a@x.com");
    expect(screen.getByText(/Última alteração:/)).toBeInTheDocument();
    expect(
      screen.getByText(/não por variável de ambiente/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/O que continua em variável de ambiente/),
    ).toBeInTheDocument();
  });

  it("settings: never-saved state says everything is off", async () => {
    api.getEmailSettings.mockResolvedValue({
      ...settings,
      welcomeMode: "OFF",
      purchaseConfirmationMode: "OFF",
      startAt: null,
      allowlist: [],
      updatedAt: null,
      updatedByAdminId: null,
    });

    render(await SettingsPage());

    expect(
      screen.getByText(/Nunca alterado \(tudo desligado\)/),
    ).toBeInTheDocument();
  });

  const template = (key: string, label: string, isCustom = false) => ({
    key,
    label,
    description: `Descrição de ${label}`,
    variables: [{ name: "saudacao", description: "Saudação" }],
    unsubscribeFooter: true,
    defaults: { subject: "S", body: "B" },
    current: {
      key,
      subject: "S",
      body: "B",
      isCustom,
      version: isCustom ? 2 : 0,
      updatedAt: null,
      updatedByAdminId: null,
    },
  });

  it("templates: one tab per template, the selected one is edited, customised ones are marked", async () => {
    api.listEmailTemplates.mockResolvedValue([
      template("WELCOME", "Boas-vindas", true),
      template("FEEDBACK_VIEWED", "Feedback — viu a análise"),
    ]);

    render(
      await TemplatesPage({
        searchParams: Promise.resolve({ key: "FEEDBACK_VIEWED" }),
      }),
    );

    const links = screen.getAllByRole("link");
    expect(
      links.find((a) => a.textContent === "Boas-vindas ●"),
    ).toHaveAttribute("href", "/admin/emails/templates?key=WELCOME");
    expect(
      screen.getByRole("heading", { name: "Feedback — viu a análise" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Texto padrão")).toBeInTheDocument();
  });

  it("templates: unknown key falls back to the first template", async () => {
    api.listEmailTemplates.mockResolvedValue([
      template("WELCOME", "Boas-vindas"),
    ]);

    render(
      await TemplatesPage({ searchParams: Promise.resolve({ key: "NOPE" }) }),
    );

    expect(
      screen.getByRole("heading", { name: "Boas-vindas" }),
    ).toBeInTheDocument();
  });
});
