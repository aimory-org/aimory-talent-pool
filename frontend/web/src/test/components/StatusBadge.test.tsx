/**
 * Tests for StatusBadge component
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/TalentDashboard/components/StatusBadge";
import type { CandidateStatus } from "@/types/talent";

describe("StatusBadge", () => {
  const statuses: CandidateStatus[] = [
    "Potential Candidate",
    "Active Candidate",
    "Placed Candidate",
    "Stale Candidate",
    "Do Not Contact",
  ];

  it.each(statuses)("renders %s status text", (status) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it("applies correct styling for Potential Candidate", () => {
    render(<StatusBadge status="Potential Candidate" />);
    const badge = screen.getByText("Potential Candidate");
    expect(badge).toHaveClass("bg-emerald-500/12");
  });

  it("applies correct styling for Active Candidate", () => {
    render(<StatusBadge status="Active Candidate" />);
    const badge = screen.getByText("Active Candidate");
    expect(badge).toHaveClass("bg-indigo-500/12");
  });

  it("applies correct styling for Placed Candidate", () => {
    render(<StatusBadge status="Placed Candidate" />);
    const badge = screen.getByText("Placed Candidate");
    expect(badge).toHaveClass("bg-violet-500/12");
  });

  it("applies correct styling for Stale Candidate", () => {
    render(<StatusBadge status="Stale Candidate" />);
    const badge = screen.getByText("Stale Candidate");
    expect(badge).toHaveClass("bg-amber-500/12");
  });

  it("applies correct styling for Do Not Contact", () => {
    render(<StatusBadge status="Do Not Contact" />);
    const badge = screen.getByText("Do Not Contact");
    expect(badge).toHaveClass("bg-red-500/12");
  });

  it("renders as a span element", () => {
    render(<StatusBadge status="Active Candidate" />);
    const badge = screen.getByText("Active Candidate");
    expect(badge.tagName).toBe("SPAN");
  });

  it("has rounded-full class for pill shape", () => {
    render(<StatusBadge status="Active Candidate" />);
    const badge = screen.getByText("Active Candidate");
    expect(badge).toHaveClass("rounded-full");
  });
});
