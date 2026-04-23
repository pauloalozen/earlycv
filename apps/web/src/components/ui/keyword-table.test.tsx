import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { KeywordTable } from "./keyword-table";

describe("KeywordTable", () => {
  it("renders keyword rows with status and delta badges", () => {
    render(
      <KeywordTable
        keywords={[
          { name: "React", presente: true, delta: 2 },
          { name: "Node.js", presente: false, delta: -1 },
        ]}
      />,
    );

    expect(screen.getByText("React")).not.toBeNull();
    expect(screen.getByText("Node.js")).not.toBeNull();
    expect(screen.getByText("Sim")).not.toBeNull();
    expect(screen.getByText("Não")).not.toBeNull();
    expect(screen.getByText("+2")).not.toBeNull();
    expect(screen.getByText("-1")).not.toBeNull();
  });
});
