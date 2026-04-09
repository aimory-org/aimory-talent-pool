/**
 * Tests for TalentTable component
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TalentTable } from "@/components/TalentDashboard/components/TalentTable";
import { mockTalents } from "../mocks/handlers";

describe("TalentTable", () => {
  const defaultProps = {
    profiles: mockTalents,
    isLoading: false,
    sortField: "name" as const,
    sortDirection: "asc" as const,
    onSort: vi.fn(),
    onSelectProfile: vi.fn(),
    activeFilterCount: 0,
    onClearFilters: vi.fn(),
  };

  describe("Row rendering", () => {
    it("renders all profile rows", () => {
      render(<TalentTable {...defaultProps} />);

      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("Jane Smith")).toBeInTheDocument();
      expect(screen.getByText("Bob Wilson")).toBeInTheDocument();
    });

    it("displays candidate name and email", () => {
      render(<TalentTable {...defaultProps} />);

      expect(screen.getByText("John Doe")).toBeInTheDocument();
      expect(screen.getByText("john@example.com")).toBeInTheDocument();
    });

    it("displays category for each profile", () => {
      render(<TalentTable {...defaultProps} />);

      expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
    });

    it("displays status badges", () => {
      render(<TalentTable {...defaultProps} />);

      expect(screen.getByText("Active Candidate")).toBeInTheDocument();
      expect(screen.getByText("Potential Candidate")).toBeInTheDocument();
      expect(screen.getByText("Placed Candidate")).toBeInTheDocument();
    });

    it("displays clearance badges when present", () => {
      render(<TalentTable {...defaultProps} />);

      expect(screen.getByText("Secret")).toBeInTheDocument();
      expect(screen.getByText("TS")).toBeInTheDocument();
    });
  });

  describe("Column sorting", () => {
    it("renders sortable headers for all columns", () => {
      render(<TalentTable {...defaultProps} />);

      expect(screen.getByText("Candidate")).toBeInTheDocument();
      expect(screen.getByText("Job Title")).toBeInTheDocument();
      expect(screen.getByText("Location")).toBeInTheDocument();
      expect(screen.getByText("Clearance")).toBeInTheDocument();
      expect(screen.getByText("Req. Salary")).toBeInTheDocument();
      expect(screen.getByText("Exp.")).toBeInTheDocument();
      expect(screen.getByText("Status")).toBeInTheDocument();
      expect(screen.getByText("Received")).toBeInTheDocument();
    });

    it("calls onSort when clicking a header", async () => {
      const onSort = vi.fn();
      render(<TalentTable {...defaultProps} onSort={onSort} />);

      await userEvent.click(screen.getByText("Status"));

      expect(onSort).toHaveBeenCalledWith("status");
    });
  });

  describe("Row selection", () => {
    it("calls onSelectProfile when clicking a row", async () => {
      const onSelectProfile = vi.fn();
      render(
        <TalentTable {...defaultProps} onSelectProfile={onSelectProfile} />,
      );

      await userEvent.click(screen.getByText("John Doe"));

      expect(onSelectProfile).toHaveBeenCalledWith(mockTalents[0]);
    });
  });

  describe("Empty state", () => {
    it("shows empty state when no profiles", () => {
      render(<TalentTable {...defaultProps} profiles={[]} />);

      expect(screen.getByText("No candidates found")).toBeInTheDocument();
    });

    it("shows clear filters button in empty state when filters active", () => {
      render(
        <TalentTable {...defaultProps} profiles={[]} activeFilterCount={3} />,
      );

      expect(screen.getByText("Clear all filters")).toBeInTheDocument();
    });

    it("calls onClearFilters when clicking clear button in empty state", async () => {
      const onClearFilters = vi.fn();
      render(
        <TalentTable
          {...defaultProps}
          profiles={[]}
          activeFilterCount={3}
          onClearFilters={onClearFilters}
        />,
      );

      await userEvent.click(screen.getByText("Clear all filters"));

      expect(onClearFilters).toHaveBeenCalled();
    });

    it("shows different message when no filters active", () => {
      render(
        <TalentTable {...defaultProps} profiles={[]} activeFilterCount={0} />,
      );

      expect(
        screen.getByText("Add candidates to get started"),
      ).toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it("shows loading indicator when isLoading is true", () => {
      render(<TalentTable {...defaultProps} profiles={[]} isLoading={true} />);

      expect(screen.getByText("Loading candidates...")).toBeInTheDocument();
    });

    it("shows loading subtext", () => {
      render(<TalentTable {...defaultProps} profiles={[]} isLoading={true} />);

      expect(screen.getByText("This may take a moment")).toBeInTheDocument();
    });
  });
});
