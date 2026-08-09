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

  it('exibe o botão "Ajustar áreas de oportunidade" e nenhum modal inicialmente', () => {
    render(
      <RadarProfileEditor
        initialAreas={["DATA_AI", "SOFTWARE_ENGINEERING"]}
        initialSeniority="SENIOR"
      />,
    );

    expect(
      screen.getByTestId("radar-profile-trigger-btn"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("radar-profile-modal")).not.toBeInTheDocument();
  });

  it("abre o modal com as áreas e senioridade atuais ao clicar no botão", () => {
    render(
      <RadarProfileEditor
        initialAreas={["DATA_AI", "SOFTWARE_ENGINEERING"]}
        initialSeniority="SENIOR"
      />,
    );

    fireEvent.click(screen.getByTestId("radar-profile-trigger-btn"));

    expect(screen.getByTestId("radar-profile-modal")).toBeInTheDocument();
    expect(screen.getByText("Filtros de oportunidade")).toBeInTheDocument();
    expect(
      screen.getByText("Defina suas áreas de interesse para calibrar o Radar"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dados & IA/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByRole("button", { name: /Growth & Marketing Digital/i }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("option", { name: "Sênior" }).selected).toBe(true);
  });

  it("fecha o modal ao clicar em Cancelar sem salvar", () => {
    render(
      <RadarProfileEditor initialAreas={["DATA_AI"]} initialSeniority="MID" />,
    );

    fireEvent.click(screen.getByTestId("radar-profile-trigger-btn"));
    fireEvent.click(
      screen.getByRole("button", { name: /Business Analytics/i }),
    );
    fireEvent.click(screen.getByTestId("radar-profile-cancel-btn"));

    expect(updateMyRadarProfileMock).not.toHaveBeenCalled();

    // Reabrindo, as seleções voltam ao estado inicial (edição descartada).
    fireEvent.click(screen.getByTestId("radar-profile-trigger-btn"));
    expect(
      screen.getByRole("button", { name: /Business Analytics/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("ao salvar, chama PUT /api/radar/profile, fecha o modal e mostra toast", async () => {
    updateMyRadarProfileMock.mockResolvedValue(true);

    render(
      <RadarProfileEditor initialAreas={["DATA_AI"]} initialSeniority="MID" />,
    );

    fireEvent.click(screen.getByTestId("radar-profile-trigger-btn"));
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

    await waitFor(() => {
      expect(
        screen.queryByTestId("radar-profile-modal"),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByText("Radar recalibrado")).toBeInTheDocument();
    expect(routerRefreshMock).toHaveBeenCalledTimes(1);
  });
});
