/**
 * Tests for ClearanceBadge component
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClearanceBadge } from "@/components/TalentDashboard/components/ClearanceBadge";
import type { ClearanceLevel } from "@/types/talent";

describe("ClearanceBadge", () => {
  const clearanceLevels: NonNullable<ClearanceLevel>[] = [
    "Secret",
    "TS",
    "TS/SCI",
    "TS/SCI/FSP",
    "TS/SCI/CI",
    "Yankee White",
  ];

  it("returns null when level is null", () => {
    const { container } = render(<ClearanceBadge level={null} />);
    expect(container.firstChild).toBeNull();
  });

  it.each(clearanceLevels)("renders %s clearance text", (level) => {
    render(<ClearanceBadge level={level} />);
    expect(screen.getByText(level)).toBeInTheDocument();
  });

  it("applies correct styling for Secret", () => {
    render(<ClearanceBadge level="Secret" />);
    const badge = screen.getByText("Secret");
    expect(badge).toHaveClass("bg-amber-500/20");
  });

  it("applies correct styling for TS", () => {
    render(<ClearanceBadge level="TS" />);
    const badge = screen.getByText("TS");
    expect(badge).toHaveClass("bg-orange-500/20");
  });

  it("applies correct styling for TS/SCI", () => {
    render(<ClearanceBadge level="TS/SCI" />);
    const badge = screen.getByText("TS/SCI");
    expect(badge).toHaveClass("bg-red-500/20");
  });

  it("applies correct styling for TS/SCI/FSP", () => {
    render(<ClearanceBadge level="TS/SCI/FSP" />);
    const badge = screen.getByText("TS/SCI/FSP");
    expect(badge).toHaveClass("bg-purple-500/20");
  });

  it("applies correct styling for Yankee White", () => {
    render(<ClearanceBadge level="Yankee White" />);
    const badge = screen.getByText("Yankee White");
    expect(badge).toHaveClass("bg-indigo-500/20");
  });

  it("includes Shield icon", () => {
    render(<ClearanceBadge level="Secret" />);
    // Shield icon should be present - check for svg element
    const badge = screen.getByText("Secret").closest("span");
    const svg = badge?.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders as a span element", () => {
    render(<ClearanceBadge level="Secret" />);
    const badge = screen.getByText("Secret");
    expect(badge.tagName).toBe("SPAN");
  });
});
