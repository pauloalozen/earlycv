import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminScrollKeeper } from "./admin-scroll-keeper";

let scrollY = 0;
const scrollTo = vi.fn((_x: number, y: number) => {
  scrollY = y;
});

function setScroll(y: number) {
  scrollY = y;
  window.dispatchEvent(new Event("scroll"));
}

function submitForm() {
  const form = document.createElement("form");
  document.body.appendChild(form);
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  form.remove();
}

// Simula o redirect da server action: troca a URL e o Next joga pro topo.
function simulateRedirect(url: string, y = 0) {
  window.history.replaceState(null, "", url);
  act(() => setScroll(y));
}

describe("AdminScrollKeeper", () => {
  beforeEach(() => {
    scrollY = 0;
    scrollTo.mockClear();
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => scrollY,
    });
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    window.history.replaceState(null, "", "/admin/product-updates/abc");
  });

  afterEach(() => cleanup());

  it("restores the position after a same-route redirect and shows the message", () => {
    render(<AdminScrollKeeper />);
    setScroll(900);
    submitForm();

    simulateRedirect(
      "/admin/product-updates/abc?status=success&message=Teste+enviado.",
    );

    expect(scrollTo).toHaveBeenCalledWith(0, 900);
    expect(scrollY).toBe(900);
    expect(screen.getByRole("status").textContent).toContain("Teste enviado.");
  });

  it("does not touch the scroll when the action leads to another route", () => {
    render(<AdminScrollKeeper />);
    setScroll(900);
    submitForm();

    simulateRedirect("/admin/product-updates/new-id");

    expect(scrollTo).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps the anchor scroll when the redirect has a hash", () => {
    render(<AdminScrollKeeper />);
    setScroll(900);
    submitForm();

    simulateRedirect("/admin/product-updates/abc?result=ok#result", 400);

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("gives the scroll back to the user once they interact", () => {
    render(<AdminScrollKeeper />);
    setScroll(900);
    submitForm();

    window.dispatchEvent(new Event("wheel"));
    simulateRedirect("/admin/product-updates/abc?status=success&message=ok");

    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("ignores scrolls without a pending submit", () => {
    render(<AdminScrollKeeper />);
    setScroll(900);
    setScroll(0);

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
