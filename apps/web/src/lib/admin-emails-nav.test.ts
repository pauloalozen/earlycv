import { describe, expect, it } from "vitest";

import {
  EMAILS_TABS,
  isEmailsRoute,
  resolveActiveEmailsTab,
} from "./admin-emails-nav";

describe("admin emails navigation", () => {
  it("keeps the three pre-existing email tabs on their ORIGINAL routes (no moved URLs, no broken links)", () => {
    const hrefs = Object.fromEntries(EMAILS_TABS.map((t) => [t.id, t.href]));
    expect(hrefs["alerta-vagas"]).toBe("/admin/alerta-vagas");
    expect(hrefs["product-updates"]).toBe("/admin/product-updates");
    expect(hrefs.recuperacao).toBe("/admin/payment-recovery");
  });

  it("adds the new dispatch tabs under /admin/emails", () => {
    const ids = EMAILS_TABS.map((t) => t.id);
    expect(ids).toEqual([
      "visao-geral",
      "alerta-vagas",
      "product-updates",
      "recuperacao",
      "relacionamento",
      "compras",
      "templates",
      "supressoes",
      "configuracoes",
    ]);
    for (const tab of EMAILS_TABS.filter((t) =>
      [
        "relacionamento",
        "compras",
        "templates",
        "supressoes",
        "configuracoes",
      ].includes(t.id),
    )) {
      expect(tab.href.startsWith("/admin/emails/")).toBe(true);
    }
  });

  it.each([
    ["/admin/emails", "visao-geral"],
    ["/admin/alerta-vagas", "alerta-vagas"],
    ["/admin/alerta-vagas/digest/abc", "alerta-vagas"],
    ["/admin/product-updates", "product-updates"],
    ["/admin/product-updates/campanha-1", "product-updates"],
    ["/admin/payment-recovery", "recuperacao"],
    ["/admin/emails/relacionamento", "relacionamento"],
    ["/admin/emails/compras", "compras"],
    ["/admin/emails/templates", "templates"],
    ["/admin/emails/supressoes", "supressoes"],
    ["/admin/emails/configuracoes", "configuracoes"],
    // detalhe de um envio não tem aba própria: fica em Relacionamento
    ["/admin/emails/envios/xyz", "relacionamento"],
  ])("%s -> %s", (pathname, expected) => {
    expect(resolveActiveEmailsTab(pathname)).toBe(expected);
    expect(isEmailsRoute(pathname)).toBe(true);
  });

  it("the overview tab does not swallow the other tabs (exact match only)", () => {
    expect(resolveActiveEmailsTab("/admin/emails/templates")).not.toBe(
      "visao-geral",
    );
  });

  it.each([
    "/admin",
    "/admin/usuarios",
    "/admin/pagamentos",
    "/admin/monitor/usuarios/1",
    "/admin/emails-fake",
    "/dashboard",
  ])("%s is not part of the Emails area", (pathname) => {
    expect(resolveActiveEmailsTab(pathname)).toBeNull();
    expect(isEmailsRoute(pathname)).toBe(false);
  });
});
