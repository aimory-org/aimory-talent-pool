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
    placedCount: 25,
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

  it("renders placed count", () => {
    render(<StatsCards stats={defaultStats} />);
    expect(screen.getByText("25")).toBeInTheDocument();
    expect(screen.getByText("Placed")).toBeInTheDocument();
  });

  it("displays zero counts correctly", () => {
    const zeroStats = {
      total: 0,
      potentialCount: 0,
      activeCount: 0,
      placedCount: 0,
    };

    render(<StatsCards stats={zeroStats} />);

    // Should have four "0" values
    const zeros = screen.getAllByText("0");
    expect(zeros).toHaveLength(4);
  });

  it("displays large numbers", () => {
    const largeStats = {
      total: 10000,
      potentialCount: 5000,
      activeCount: 3000,
      placedCount: 2000,
    };

    render(<StatsCards stats={largeStats} />);

    expect(screen.getByText("10000")).toBeInTheDocument();
    expect(screen.getByText("5000")).toBeInTheDocument();
    expect(screen.getByText("3000")).toBeInTheDocument();
    expect(screen.getByText("2000")).toBeInTheDocument();
  });

  it("renders all four stat cards", () => {
    const { container } = render(<StatsCards stats={defaultStats} />);

    // Should have 4 stat cards in the grid
    const grid = container.querySelector(".grid");
    expect(grid).toBeInTheDocument();
    expect(grid?.children).toHaveLength(4);
  });

  it("has correct color coding for each card type", () => {
    const { container } = render(<StatsCards stats={defaultStats} />);

    // Check for presence of color classes
    expect(container.querySelector(".bg-emerald-500\\/10")).toBeInTheDocument(); // Potential
    expect(container.querySelector(".bg-blue-500\\/10")).toBeInTheDocument(); // Active
    expect(container.querySelector(".bg-green-500\\/10")).toBeInTheDocument(); // Placed
  });
});
