import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() =>
  vi.fn((location: string) => {
    throw new Error(`REDIRECT:${location}`);
  }),
);
const updateJobSourceMock = vi.hoisted(() => vi.fn());
const createCompanyMock = vi.hoisted(() => vi.fn());
const createJobSourceMock = vi.hoisted(() => vi.fn());
const runJobSourceAdHocMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/admin-ingestion-api", () => ({
  createCompany: createCompanyMock,
  createJobSource: createJobSourceMock,
  runJobSourceAdHoc: runJobSourceAdHocMock,
  updateJobSource: updateJobSourceMock,
}));

import {
  createCompanyAndSourceAction,
  updateJobSourceAction,
  updateJobSourceScheduleAction,
} from "./actions";

describe("updateJobSourceScheduleAction", () => {
  beforeEach(() => {
    updateJobSourceMock.mockReset();
    redirectMock.mockClear();
  });

  it("redirects with error when jobSourceId is missing", async () => {
    const formData = new FormData();
    formData.set("redirectPath", "/admin/ingestion/src_1");

    await expect(updateJobSourceScheduleAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/ingestion/src_1?status=error&message=Informe+a+fonte.",
    );

    expect(updateJobSourceMock).not.toHaveBeenCalled();
  });

  it("persists schedule toggle and cron then redirects with success", async () => {
    updateJobSourceMock.mockResolvedValue({ id: "src_1" });

    const formData = new FormData();
    formData.set("jobSourceId", "src_1");
    formData.set("scheduleEnabled", "on");
    formData.set("scheduleCron", "*/30 * * * *");
    formData.set("redirectPath", "/admin/ingestion/src_1");

    await expect(updateJobSourceScheduleAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/ingestion/src_1?status=success&message=Agendamento+da+fonte+atualizado.",
    );

    expect(updateJobSourceMock).toHaveBeenCalledWith("src_1", {
      scheduleCron: "*/30 * * * *",
      scheduleEnabled: true,
      scheduleTimezone: "America/Sao_Paulo",
    });
  });

  it("uses fallback cron when enabled and cron is blank", async () => {
    updateJobSourceMock.mockResolvedValue({ id: "src_1" });

    const formData = new FormData();
    formData.set("jobSourceId", "src_1");
    formData.set("scheduleEnabled", "on");
    formData.set("scheduleCron", "   ");
    formData.set("redirectPath", "/admin/ingestion/src_1");

    await expect(updateJobSourceScheduleAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/ingestion/src_1?status=success&message=Agendamento+da+fonte+atualizado.",
    );

    expect(updateJobSourceMock).toHaveBeenCalledWith("src_1", {
      scheduleCron: "*/30 * * * *",
      scheduleEnabled: true,
      scheduleTimezone: "America/Sao_Paulo",
    });
  });

  it("sends disabled schedule payload", async () => {
    updateJobSourceMock.mockResolvedValue({ id: "src_1" });

    const formData = new FormData();
    formData.set("jobSourceId", "src_1");
    formData.set("redirectPath", "/admin/ingestion/src_1");

    await expect(updateJobSourceScheduleAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/ingestion/src_1?status=success&message=Agendamento+da+fonte+atualizado.",
    );

    expect(updateJobSourceMock).toHaveBeenCalledWith("src_1", {
      scheduleCron: null,
      scheduleEnabled: false,
    });
  });

  it("redirects with error message when API update fails", async () => {
    updateJobSourceMock.mockRejectedValue(new Error("falha api"));

    const formData = new FormData();
    formData.set("jobSourceId", "src_1");
    formData.set("scheduleEnabled", "on");
    formData.set("scheduleCron", "*/30 * * * *");
    formData.set("redirectPath", "/admin/ingestion/src_1");

    await expect(updateJobSourceScheduleAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/ingestion/src_1?status=error&message=falha+api",
    );
  });
});

describe("updateJobSourceAction", () => {
  beforeEach(() => {
    updateJobSourceMock.mockReset();
    redirectMock.mockClear();
  });

  it("redirects with error when jobSourceId is missing", async () => {
    const formData = new FormData();
    formData.set("redirectPath", "/admin/ingestion/src_1");

    await expect(updateJobSourceAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/ingestion/src_1?status=error&message=Informe+a+fonte.",
    );

    expect(updateJobSourceMock).not.toHaveBeenCalled();
  });

  it("redirects with error when required fields are blank", async () => {
    const formData = new FormData();
    formData.set("jobSourceId", "src_1");
    formData.set("redirectPath", "/admin/ingestion/src_1");

    await expect(updateJobSourceAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/ingestion/src_1?status=error&message=Preencha+os+campos+obrigatorios+da+fonte.",
    );

    expect(updateJobSourceMock).not.toHaveBeenCalled();
  });

  it("derives parser/crawl strategy from source type and persists core fields", async () => {
    updateJobSourceMock.mockResolvedValue({ id: "src_1" });

    const formData = new FormData();
    formData.set("jobSourceId", "src_1");
    formData.set("sourceName", "  ACME Careers  ");
    formData.set("sourceType", "custom_html");
    formData.set("sourceUrl", " https://acme.dev/careers ");
    formData.set("checkIntervalMinutes", "30");
    formData.set("isActive", "on");
    formData.set("redirectPath", "/admin/ingestion/src_1");

    await expect(updateJobSourceAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/ingestion/src_1?status=success&message=Fonte+atualizada+com+sucesso.",
    );

    expect(updateJobSourceMock).toHaveBeenCalledWith("src_1", {
      checkIntervalMinutes: 30,
      crawlStrategy: "html",
      isActive: true,
      isFallbackAdapter: true,
      parserKey: "custom_html",
      sourceName: "ACME Careers",
      sourceType: "custom_html",
      sourceUrl: "https://acme.dev/careers",
    });
  });

  it("infers gupy type from sourceUrl hostname even when a different type is selected", async () => {
    updateJobSourceMock.mockResolvedValue({ id: "src_1" });

    const formData = new FormData();
    formData.set("jobSourceId", "src_1");
    formData.set("sourceName", "Itau Gupy");
    formData.set("sourceType", "custom_html");
    formData.set("sourceUrl", "https://vemproitau.gupy.io/");
    formData.set("checkIntervalMinutes", "30");
    formData.set("redirectPath", "/admin/ingestion/src_1");

    await expect(updateJobSourceAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/ingestion/src_1?status=success&message=Fonte+atualizada+com+sucesso.",
    );

    expect(updateJobSourceMock).toHaveBeenCalledWith("src_1", {
      checkIntervalMinutes: 30,
      crawlStrategy: "api",
      isActive: false,
      isFallbackAdapter: false,
      parserKey: "gupy",
      sourceName: "Itau Gupy",
      sourceType: "gupy",
      sourceUrl: "https://vemproitau.gupy.io/",
    });
  });

  it("redirects with error message when API update fails", async () => {
    updateJobSourceMock.mockRejectedValue(new Error("fonte duplicada"));

    const formData = new FormData();
    formData.set("jobSourceId", "src_1");
    formData.set("sourceName", "ACME Careers");
    formData.set("sourceType", "custom_html");
    formData.set("sourceUrl", "https://acme.dev/careers");
    formData.set("checkIntervalMinutes", "30");
    formData.set("redirectPath", "/admin/ingestion/src_1");

    await expect(updateJobSourceAction(formData)).rejects.toThrow(
      "REDIRECT:/admin/ingestion/src_1?status=error&message=fonte+duplicada",
    );
  });
});

describe("createCompanyAndSourceAction", () => {
  beforeEach(() => {
    createCompanyMock.mockReset();
    createJobSourceMock.mockReset();
    runJobSourceAdHocMock.mockReset();
    redirectMock.mockClear();
  });

  function buildFormData(overrides: Record<string, string> = {}) {
    const formData = new FormData();
    formData.set("name", "ACME Labs");
    formData.set("careersUrl", "https://acme.gupy.io");
    formData.set("industry", "Tecnologia");
    formData.set("sourceName", "ACME Careers");
    formData.set("sourceType", "greenhouse");
    formData.set(
      "sourceUrl",
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
    );
    formData.set("checkIntervalMinutes", "30");
    formData.set("redirectPath", "/admin/ingestion/new");
    for (const [key, value] of Object.entries(overrides)) {
      formData.set(key, value);
    }
    return formData;
  }

  it("creates the company then the job source with the adapter type chosen upfront, and redirects with success", async () => {
    createCompanyMock.mockResolvedValue({ id: "company_1", name: "ACME Labs" });
    createJobSourceMock.mockResolvedValue({
      id: "source_1",
      sourceName: "ACME Careers",
    });

    const expected = new URLSearchParams({
      status: "success",
      message: 'Empresa "ACME Labs" e fonte ACME Careers criadas com sucesso.',
    }).toString();

    await expect(
      createCompanyAndSourceAction(buildFormData()),
    ).rejects.toThrow(`REDIRECT:/admin/ingestion?${expected}`);

    expect(createCompanyMock).toHaveBeenCalledWith({
      careersUrl: "https://acme.gupy.io",
      industry: "Tecnologia",
      name: "ACME Labs",
    });
    expect(createJobSourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company_1",
        crawlStrategy: "api",
        parserKey: "greenhouse",
        sourceType: "greenhouse",
        sourceUrl: "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
      }),
    );
    expect(runJobSourceAdHocMock).not.toHaveBeenCalled();
  });

  it("runs the source right away when runAfterCreate is checked", async () => {
    createCompanyMock.mockResolvedValue({ id: "company_1", name: "ACME Labs" });
    createJobSourceMock.mockResolvedValue({
      id: "source_1",
      sourceName: "ACME Careers",
    });
    runJobSourceAdHocMock.mockResolvedValue(undefined);

    const expected = new URLSearchParams({
      status: "success",
      message:
        'Empresa "ACME Labs" e fonte ACME Careers criadas, job disparado. Acompanhe na aba Jobs.',
    }).toString();

    await expect(
      createCompanyAndSourceAction(buildFormData({ runAfterCreate: "on" })),
    ).rejects.toThrow(`REDIRECT:/admin/ingestion?${expected}`);

    expect(runJobSourceAdHocMock).toHaveBeenCalledWith("source_1");
  });

  it("redirects with error and never touches job source when company creation fails", async () => {
    createCompanyMock.mockRejectedValue(new Error("nome ja existe"));

    const expected = new URLSearchParams({
      status: "error",
      message: "nome ja existe",
    }).toString();

    await expect(
      createCompanyAndSourceAction(buildFormData()),
    ).rejects.toThrow(`REDIRECT:/admin/ingestion/new?${expected}`);

    expect(createJobSourceMock).not.toHaveBeenCalled();
  });

  it("keeps the company and redirects to its page when job source creation fails", async () => {
    createCompanyMock.mockResolvedValue({ id: "company_1", name: "ACME Labs" });
    createJobSourceMock.mockRejectedValue(new Error("fonte duplicada"));

    const expected = new URLSearchParams({
      status: "error",
      message:
        'Empresa "ACME Labs" criada, mas a fonte falhou: fonte duplicada. Complete o cadastro da fonte abaixo.',
    }).toString();

    await expect(
      createCompanyAndSourceAction(buildFormData()),
    ).rejects.toThrow(`REDIRECT:/admin/empresas/company_1?${expected}`);
  });
});
