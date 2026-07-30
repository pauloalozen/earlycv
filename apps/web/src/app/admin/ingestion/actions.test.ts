import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() =>
  vi.fn((location: string) => {
    throw new Error(`REDIRECT:${location}`);
  }),
);
const updateJobSourceMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/admin-ingestion-api", () => ({
  updateJobSource: updateJobSourceMock,
}));

import {
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
