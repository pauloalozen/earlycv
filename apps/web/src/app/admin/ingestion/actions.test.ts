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

import { updateJobSourceScheduleAction } from "./actions";

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
