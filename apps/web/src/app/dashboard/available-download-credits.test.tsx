import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvailableDownloadCredits } from "./available-download-credits";

describe("AvailableDownloadCredits", () => {
  it("decrements credits after redeem event", async () => {
    render(
      <AvailableDownloadCredits
        initialDisplay={3}
        initialCreditsRemaining={3}
      />,
    );

    expect(screen.getByText("3")).toBeTruthy();

    window.dispatchEvent(new Event("dashboard:credit-redeemed"));

    await waitFor(() => {
      expect(screen.getByText("2")).toBeTruthy();
    });
  });

  it("keeps infinity display unchanged", () => {
    render(
      <AvailableDownloadCredits
        initialDisplay="∞"
        initialCreditsRemaining={null}
      />,
    );

    window.dispatchEvent(new Event("dashboard:credit-redeemed"));

    expect(screen.getByText("∞")).toBeTruthy();
  });
});
