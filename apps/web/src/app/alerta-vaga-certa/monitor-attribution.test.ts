import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  captureMonitorEmailOriginFromUrl,
  getMonitorProductOrigin,
} from "./monitor-attribution";

function setUrl(search: string) {
  window.history.replaceState({}, "", `/alerta-vaga-certa${search}`);
}

describe("monitor-attribution", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setUrl("");
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("defaults to product_origin=monitor when no email UTM is present", () => {
    expect(getMonitorProductOrigin()).toBe("monitor");
  });

  it("captures monitor_email origin from the URL and persists it for the session", () => {
    setUrl(
      "?utm_source=monitor_email&utm_medium=email&utm_campaign=monitor_digest",
    );

    captureMonitorEmailOriginFromUrl();

    expect(getMonitorProductOrigin()).toBe("monitor_email");
  });

  it("ignores unrelated utm_source values", () => {
    setUrl("?utm_source=newsletter");

    captureMonitorEmailOriginFromUrl();

    expect(getMonitorProductOrigin()).toBe("monitor");
  });

  it("the captured origin survives across calls within the same session (simulating later events in the funnel)", () => {
    setUrl("?utm_source=monitor_email");
    captureMonitorEmailOriginFromUrl();

    // Simula uma navegação client-side subsequente sem o UTM na URL — o
    // sinal precisa continuar valendo pro resto da sessão.
    setUrl("");

    expect(getMonitorProductOrigin()).toBe("monitor_email");
  });
});
