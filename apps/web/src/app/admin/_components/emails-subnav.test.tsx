import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(() => cleanup());

const pathnameMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock() }));

import AlertaVagasLayout from "../alerta-vagas/layout";
import EmailsLayout from "../emails/layout";
import PaymentRecoveryLayout from "../payment-recovery/layout";
import ProductUpdatesLayout from "../product-updates/layout";
import { AdminTopbar } from "./admin-topbar";
import { EmailsSubNav } from "./emails-subnav";

const TAB_LABELS = [
  "Visão geral",
  "Alerta de Vagas",
  "Product Updates",
  "Recuperação de pagamento",
  "Relacionamento",
  "Compras",
  "Templates",
  "Supressões",
  "Configurações",
];

describe("EmailsSubNav", () => {
  beforeEach(() => pathnameMock.mockReset());

  it("lists every email tab with the right href, in one place", () => {
    pathnameMock.mockReturnValue("/admin/emails");
    render(<EmailsSubNav />);

    const nav = screen.getByRole("navigation", { name: "Emails" });
    const links = Array.from(nav.querySelectorAll("a"));
    expect(links.map((a) => a.textContent)).toEqual(TAB_LABELS);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/admin/emails",
      "/admin/alerta-vagas",
      "/admin/product-updates",
      "/admin/payment-recovery",
      "/admin/emails/relacionamento",
      "/admin/emails/compras",
      "/admin/emails/templates",
      "/admin/emails/supressoes",
      "/admin/emails/configuracoes",
    ]);
  });

  it.each([
    ["/admin/emails", "Visão geral"],
    ["/admin/alerta-vagas", "Alerta de Vagas"],
    ["/admin/alerta-vagas/digest/d1", "Alerta de Vagas"],
    ["/admin/product-updates/c1", "Product Updates"],
    ["/admin/payment-recovery", "Recuperação de pagamento"],
    ["/admin/emails/templates", "Templates"],
    ["/admin/emails/envios/e1", "Relacionamento"],
  ])("marks exactly one tab active for %s", (pathname, label) => {
    pathnameMock.mockReturnValue(pathname);
    render(<EmailsSubNav />);

    const active = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") === "page");
    expect(active.map((a) => a.textContent)).toEqual([label]);
  });
});

describe("email routes share the sub-navigation through their layouts (pages keep their own content)", () => {
  beforeEach(() => {
    pathnameMock.mockReset();
    pathnameMock.mockReturnValue("/admin/emails");
  });

  it.each([
    ["emails", EmailsLayout],
    ["alerta-vagas", AlertaVagasLayout],
    ["product-updates", ProductUpdatesLayout],
    ["payment-recovery", PaymentRecoveryLayout],
  ])("%s layout renders the sub-nav and the page content", (_name, Layout) => {
    render(<Layout>{<p>conteúdo da página</p>}</Layout>);

    expect(
      screen.getByRole("navigation", { name: "Emails" }),
    ).toBeInTheDocument();
    expect(screen.getByText("conteúdo da página")).toBeInTheDocument();
  });
});

describe("AdminTopbar: a single Emails tab replaces the three separate ones", () => {
  beforeEach(() => pathnameMock.mockReset());

  it("shows one 'Emails' item and none of the old separate tabs", () => {
    pathnameMock.mockReturnValue("/admin");
    render(<AdminTopbar />);

    const labels = screen.getAllByRole("link").map((a) => a.textContent);
    expect(labels.filter((l) => l === "Emails")).toHaveLength(1);
    expect(labels).not.toContain("Alerta de Vagas");
    expect(labels).not.toContain("Product Updates");
    expect(labels).not.toContain("Recuperação");
    expect(screen.getByRole("link", { name: "Emails" })).toHaveAttribute(
      "href",
      "/admin/emails",
    );
  });

  it.each([
    "/admin/emails",
    "/admin/emails/templates",
    "/admin/alerta-vagas",
    "/admin/alerta-vagas/digest/d1",
    "/admin/product-updates",
    "/admin/product-updates/c1",
    "/admin/payment-recovery",
  ])("keeps Emails highlighted on %s", (pathname) => {
    pathnameMock.mockReturnValue(pathname);
    render(<AdminTopbar />);

    const emails = screen.getByRole("link", { name: "Emails" });
    expect(emails).toHaveStyle({ color: "rgb(10, 10, 10)" });
  });

  it("does not highlight Emails elsewhere", () => {
    pathnameMock.mockReturnValue("/admin/usuarios");
    render(<AdminTopbar />);

    expect(screen.getByRole("link", { name: "Emails" })).not.toHaveStyle({
      color: "rgb(10, 10, 10)",
    });
  });
});
