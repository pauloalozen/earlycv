import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RegisterForm } from "./register-form";

describe("RegisterForm conversion context propagation", () => {
  afterEach(() => {
    cleanup();
  });

  it("submits the conversionContext prop explicitly as a hidden field, never inferred client-side", () => {
    const { container } = render(
      <RegisterForm next="" conversionContext="analysis_guest" />,
    );

    const hiddenInput = container.querySelector<HTMLInputElement>(
      'input[name="conversionContext"]',
    );

    expect(hiddenInput).not.toBeNull();
    expect(hiddenInput?.value).toBe("analysis_guest");
  });

  it("submits direct_auth when the page resolved no explicit context", () => {
    const { container } = render(
      <RegisterForm next="" conversionContext="direct_auth" />,
    );

    const hiddenInput = container.querySelector<HTMLInputElement>(
      'input[name="conversionContext"]',
    );

    expect(hiddenInput?.value).toBe("direct_auth");
  });

  it("does not render a sessionInternalId field before it is read from sessionStorage", () => {
    const { container } = render(
      <RegisterForm next="" conversionContext="radar" />,
    );

    // jsdom's sessionStorage starts empty in this test, so the effect
    // that reads journey_session_internal_id resolves to "" and the
    // hidden field must not render (matches the `{sessionInternalId && ...}` guard).
    const hiddenInput = container.querySelector(
      'input[name="sessionInternalId"]',
    );
    expect(hiddenInput).toBeNull();
  });

  it("renders the sessionInternalId hidden field once sessionStorage has a journey session id", () => {
    sessionStorage.setItem("journey_session_internal_id", "journey-abc-123");

    const { container } = render(
      <RegisterForm next="" conversionContext="checkout" />,
    );

    const hiddenInput = container.querySelector<HTMLInputElement>(
      'input[name="sessionInternalId"]',
    );
    expect(hiddenInput?.value).toBe("journey-abc-123");

    sessionStorage.removeItem("journey_session_internal_id");
  });
});
