/**
 * Tests for StatsCards component
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsCards } from "@/components/TalentDashboard/components/StatsCards";

describe("StatsCards", () => {
  const defaultStats = {
    total: 100,
    potentialCount: 40,
    activeCount: 35,
    placedWithUsCount: 15,
    placedOtherCount: 10,
  };

  it("renders total count", () => {
    render(<StatsCards stats={defaultStats} />);
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("renders potential count", () => {
    render(<StatsCards stats={defaultStats} />);
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("Potential")).toBeInTheDocument();
  });

  it("renders active count", () => {
    render(<StatsCards stats={defaultStats} />);
    expect(screen.getByText("35")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders placed counts", () => {
    render(<StatsCards stats={defaultStats} />);
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Placed")).toBeInTheDocument();
    expect(screen.getByText("With us")).toBeInTheDocument();
    expect(screen.getByText("Outside")).toBeInTheDocument();
  });

  it("displays zero counts correctly", () => {
    const zeroStats = {
      total: 0,
      potentialCount: 0,
      activeCount: 0,
      placedWithUsCount: 0,
      placedOtherCount: 0,
    };

    render(<StatsCards stats={zeroStats} />);

    // Should have five "0" values
    const zeros = screen.getAllByText("0");
    expect(zeros).toHaveLength(5);
  });

  it("displays large numbers", () => {
    const largeStats = {
      total: 10000,
      potentialCount: 5000,
      activeCount: 3000,
      placedWithUsCount: 1200,
      placedOtherCount: 800,
    };

    render(<StatsCards stats={largeStats} />);

    expect(screen.getByText("10000")).toBeInTheDocument();
    expect(screen.getByText("5000")).toBeInTheDocument();
    expect(screen.getByText("3000")).toBeInTheDocument();
    expect(screen.getByText("1200")).toBeInTheDocument();
    expect(screen.getByText("800")).toBeInTheDocument();
  });

  it("renders all stat cards", () => {
    const { container } = render(<StatsCards stats={defaultStats} />);

    // Should have 4 stat cards in the grid (3 simple + 1 split Placed card)
    const grid = container.querySelector(".grid");
    expect(grid).toBeInTheDocument();
    expect(grid?.children).toHaveLength(4);
  });

  it("has correct color coding for each card type", () => {
    const { container } = render(<StatsCards stats={defaultStats} />);

    // Check for presence of color classes using attribute contains selector
    expect(
      container.querySelector("[class*='from-emerald-500']"),
    ).toBeInTheDocument(); // Potential
    expect(
      container.querySelector("[class*='from-indigo-500']"),
    ).toBeInTheDocument(); // Active
    expect(
      container.querySelector("[class*='from-violet-500']"),
    ).toBeInTheDocument(); // Placed
  });
});
