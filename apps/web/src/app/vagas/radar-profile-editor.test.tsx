import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerRefreshMock = vi.hoisted(() => vi.fn());
const updateMyRadarProfileMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}));

vi.mock("@/lib/radar-api", () => ({
  updateMyRadarProfile: updateMyRadarProfileMock,
}));

import { RadarProfileEditor } from "./radar-profile-editor";

describe("RadarProfileEditor", () => {
  beforeEach(() => {
    routerRefreshMock.mockReset();
    updateMyRadarProfileMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renderiza áreas selecionadas e senioridade a partir dos valores atuais", () => {
    render(
      <RadarProfileEditor
        initialAreas={["DATA_AI", "SOFTWARE_ENGINEERING"]}
        initialSeniority="SENIOR"
      />,
    );

    expect(screen.getByTestId("radar-profile-editor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dados & IA/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: /Growth & Marketing Digital/i }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("option", { name: "Sênior" }).selected).toBe(true);
  });

  it("chama PUT /api/radar/profile com as áreas e senioridade ao salvar", async () => {
    updateMyRadarProfileMock.mockResolvedValue(true);

    render(
      <RadarProfileEditor initialAreas={["DATA_AI"]} initialSeniority="MID" />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Business Analytics/i }),
    );
    fireEvent.click(screen.getByTestId("radar-profile-save-btn"));

    await waitFor(() => {
      expect(updateMyRadarProfileMock).toHaveBeenCalledWith({
        areas: ["DATA_AI", "BUSINESS_ANALYTICS"],
        seniority: "MID",
      });
    });
  });

  it("mostra toast de sucesso e recarrega a listagem após salvar", async () => {
    updateMyRadarProfileMock.mockResolvedValue(true);

    render(
      <RadarProfileEditor initialAreas={["DATA_AI"]} initialSeniority="MID" />,
    );

    fireEvent.click(screen.getByTestId("radar-profile-save-btn"));

    await waitFor(() => {
      expect(screen.getByText("Perfil atualizado")).toBeInTheDocument();
    });
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
  });
});
