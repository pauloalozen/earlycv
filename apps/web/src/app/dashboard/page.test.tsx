import DashboardPage from "./page";

describe("/dashboard", () => {
  it("renders without redirect", () => {
    expect(DashboardPage()).toBeNull();
  });
});
