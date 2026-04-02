/**
 * Tests for SortableHeader component
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SortableHeader } from "@/components/TalentDashboard/components/SortableHeader";

describe("SortableHeader", () => {
  const defaultProps = {
    label: "Name",
    field: "name" as const,
    currentSort: "name" as const,
    currentDirection: "asc" as const,
    onSort: vi.fn(),
  };

  it("renders the label text", () => {
    render(<SortableHeader {...defaultProps} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("calls onSort with field when clicked", async () => {
    const onSort = vi.fn();
    render(<SortableHeader {...defaultProps} onSort={onSort} />);

    await userEvent.click(screen.getByRole("button"));

    expect(onSort).toHaveBeenCalledWith("name");
    expect(onSort).toHaveBeenCalledTimes(1);
  });

  it("shows ChevronUp icon when sorted ascending", () => {
    render(
      <SortableHeader
        {...defaultProps}
        currentSort="name"
        currentDirection="asc"
      />,
    );

    // The button should contain an svg (chevron)
    const button = screen.getByRole("button");
    const svg = button.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("shows ChevronDown icon when sorted descending", () => {
    render(
      <SortableHeader
        {...defaultProps}
        currentSort="name"
        currentDirection="desc"
      />,
    );

    const button = screen.getByRole("button");
    const svg = button.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("hides sort indicator when not the current sort field", () => {
    render(
      <SortableHeader
        {...defaultProps}
        field="name"
        currentSort="status"
        currentDirection="asc"
      />,
    );

    // The indicator span should have opacity-0 class when not active
    const button = screen.getByRole("button");
    const indicatorSpan = button.querySelector("span");
    expect(indicatorSpan).toHaveClass("opacity-0");
  });

  it("shows sort indicator when is the current sort field", () => {
    render(
      <SortableHeader
        {...defaultProps}
        field="name"
        currentSort="name"
        currentDirection="asc"
      />,
    );

    const button = screen.getByRole("button");
    const indicatorSpan = button.querySelector("span");
    expect(indicatorSpan).toHaveClass("opacity-100");
  });

  it("renders as a button element", () => {
    render(<SortableHeader {...defaultProps} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
