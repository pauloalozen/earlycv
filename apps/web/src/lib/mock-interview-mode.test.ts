import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canAccessMockInterview,
  getMockInterviewMode,
  isMockInterviewPublic,
} from "./mock-interview-mode";

const customer = { isStaff: false, internalRole: "none" } as const;
const admin = { isStaff: true, internalRole: "admin" } as const;
const superadmin = { isStaff: true, internalRole: "superadmin" } as const;

describe("NEXT_PUBLIC_MOCK_INTERVIEW_MODE", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("missing or invalid is off", () => {
    vi.stubEnv("NEXT_PUBLIC_MOCK_INTERVIEW_MODE", "");
    expect(getMockInterviewMode()).toBe("off");
    vi.stubEnv("NEXT_PUBLIC_MOCK_INTERVIEW_MODE", "true");
    expect(getMockInterviewMode()).toBe("off");
    vi.stubEnv("NEXT_PUBLIC_MOCK_INTERVIEW_MODE", " ON ");
    expect(getMockInterviewMode()).toBe("on");
  });

  it("only 'on' shows public surfaces", () => {
    vi.stubEnv("NEXT_PUBLIC_MOCK_INTERVIEW_MODE", "admin");
    expect(isMockInterviewPublic()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_MOCK_INTERVIEW_MODE", "on");
    expect(isMockInterviewPublic()).toBe(true);
  });

  it("off: nobody; admin: staff admin/superadmin; on: everyone", () => {
    for (const user of [null, customer, admin, superadmin]) {
      expect(canAccessMockInterview(user, "off")).toBe(false);
      expect(canAccessMockInterview(user, "on")).toBe(true);
    }
    expect(canAccessMockInterview(null, "admin")).toBe(false);
    expect(canAccessMockInterview(customer, "admin")).toBe(false);
    expect(
      canAccessMockInterview(
        { isStaff: false, internalRole: "admin" },
        "admin",
      ),
    ).toBe(false);
    expect(canAccessMockInterview(admin, "admin")).toBe(true);
    expect(canAccessMockInterview(superadmin, "admin")).toBe(true);
  });
});
