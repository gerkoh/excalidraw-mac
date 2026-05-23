import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CopilotMarkdown } from "./CopilotMarkdown";

describe("CopilotMarkdown", () => {
  it("renders emphasis and headings from markdown", () => {
    const md = "### Section\n\n**Bold** and *italic*.";
    render(<CopilotMarkdown text={md} />);
    expect(screen.getByRole("heading", { level: 3, name: "Section" })).toBeTruthy();
    const strong = screen.getByText("Bold");
    expect(strong.tagName).toBe("STRONG");
    expect(screen.getByText("italic").tagName).toBe("EM");
  });

  it("renders list items", () => {
    render(<CopilotMarkdown text={"- first\n- second"} />);
    expect(screen.getByText("first")).toBeTruthy();
    expect(screen.getByText("second")).toBeTruthy();
  });
});
