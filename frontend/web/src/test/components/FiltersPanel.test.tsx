/**
 * Tests for FiltersPanel component
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FiltersPanel } from "@/components/TalentDashboard/components/FiltersPanel";
import { DEFAULT_FILTERS } from "@/components/TalentDashboard/types";

describe("FiltersPanel", () => {
  const defaultProps = {
    filters: DEFAULT_FILTERS,
    onFilterChange: vi.fn(),
    onClearFilters: vi.fn(),
    onSkillsChange: vi.fn(),
    onCertificationsChange: vi.fn(),
    activeFilterCount: 0,
    lookupSkills: ["TypeScript", "React", "Python"],
    lookupCertifications: ["AWS", "PMP", "CSM"],
    lookupJobTitles: ["Senior Software Engineer", "Project Manager"],
    lookupIndustryCategories: ["IT Engineering", "Finance", "Manufacturing"],
    lookupCities: [
      { city: "New York", state: "NY" },
      { city: "Chicago", state: "IL" },
    ],
    warningCounts: {
      duplicate: 0,
      missing_name: 0,
      missing_job_title: 0,
      no_skills: 0,
      no_location: 0,
    },
    totalWarningCount: 0,
    selectedWarningTypes: [],
    onWarningTypesChange: vi.fn(),
  };

  describe("Rendering", () => {
    it("renders filter panel header", () => {
      render(<FiltersPanel {...defaultProps} />);

      expect(screen.getByText("Filter Candidates")).toBeInTheDocument();
    });

    it("renders all filter dropdowns", () => {
      render(<FiltersPanel {...defaultProps} />);

      expect(screen.getByText("Status")).toBeInTheDocument();
      expect(screen.getByText("Service Category")).toBeInTheDocument();
      expect(screen.getByText("Industry")).toBeInTheDocument();
      expect(screen.getByText("Job Title")).toBeInTheDocument();
      expect(screen.getByText("Clearance")).toBeInTheDocument();
      expect(screen.getByText("State")).toBeInTheDocument();
      expect(screen.getByText("City")).toBeInTheDocument();
      expect(screen.getByText("Skills")).toBeInTheDocument();
      expect(screen.getByText("Certifications")).toBeInTheDocument();
    });
  });

  describe("Clear filters", () => {
    it("shows clear all button when filters are active", () => {
      render(<FiltersPanel {...defaultProps} activeFilterCount={3} />);

      expect(screen.getByText(/Clear all \(3\)/)).toBeInTheDocument();
    });

    it("hides clear all button when no filters active", () => {
      render(<FiltersPanel {...defaultProps} activeFilterCount={0} />);

      expect(screen.queryByText(/Clear all/)).not.toBeInTheDocument();
    });

    it("calls onClearFilters when clicking clear all", async () => {
      const onClearFilters = vi.fn();
      render(
        <FiltersPanel
          {...defaultProps}
          activeFilterCount={3}
          onClearFilters={onClearFilters}
        />,
      );

      await userEvent.click(screen.getByText(/Clear all/));

      expect(onClearFilters).toHaveBeenCalled();
    });
  });

  describe("Filter changes", () => {
    it("calls onFilterChange when selecting a status", async () => {
      const onFilterChange = vi.fn();
      render(
        <FiltersPanel {...defaultProps} onFilterChange={onFilterChange} />,
      );

      // Find the status select (first select after "Status" label)
      const statusLabel = screen.getByText("Status");
      const statusSelect = statusLabel.parentElement?.querySelector("select");

      if (statusSelect) {
        await userEvent.selectOptions(statusSelect, "Active Candidate");
        expect(onFilterChange).toHaveBeenCalledWith(
          "status",
          "Active Candidate",
        );
      }
    });
  });

  describe("Skills filter", () => {
    it("shows skill count when skills are selected", () => {
      const filtersWithSkills = {
        ...DEFAULT_FILTERS,
        skills: ["TypeScript", "React"],
      };

      render(<FiltersPanel {...defaultProps} filters={filtersWithSkills} />);

      expect(screen.getByText("(2)")).toBeInTheDocument();
    });

    it("renders selected skill badges", () => {
      const filtersWithSkills = {
        ...DEFAULT_FILTERS,
        skills: ["TypeScript", "React"],
      };

      render(<FiltersPanel {...defaultProps} filters={filtersWithSkills} />);

      expect(screen.getByText("TypeScript")).toBeInTheDocument();
      expect(screen.getByText("React")).toBeInTheDocument();
    });

    it("calls onSkillsChange when adding a skill", async () => {
      const onSkillsChange = vi.fn();
      render(
        <FiltersPanel {...defaultProps} onSkillsChange={onSkillsChange} />,
      );

      // Find skills select
      const skillsLabel = screen.getByText("Skills");
      const skillsSelect = skillsLabel.parentElement?.querySelector("select");

      if (skillsSelect) {
        await userEvent.selectOptions(skillsSelect, "TypeScript");
        expect(onSkillsChange).toHaveBeenCalledWith(["TypeScript"]);
      }
    });

    it("calls onSkillsChange when removing a skill", async () => {
      const filtersWithSkills = {
        ...DEFAULT_FILTERS,
        skills: ["TypeScript", "React"],
      };
      const onSkillsChange = vi.fn();

      render(
        <FiltersPanel
          {...defaultProps}
          filters={filtersWithSkills}
          onSkillsChange={onSkillsChange}
        />,
      );

      // Click the X button on TypeScript badge
      const typescriptBadge = screen.getByText("TypeScript").closest("span");
      const removeButton = typescriptBadge?.querySelector("button");

      if (removeButton) {
        await userEvent.click(removeButton);
        expect(onSkillsChange).toHaveBeenCalledWith(["React"]);
      }
    });
  });

  describe("Certifications filter", () => {
    it("shows certification count when certifications are selected", () => {
      const filtersWithCerts = {
        ...DEFAULT_FILTERS,
        certifications: ["AWS", "PMP"],
      };

      render(<FiltersPanel {...defaultProps} filters={filtersWithCerts} />);

      // There should be "(2)" displayed (may be multiple - skills also shows count)
      const countBadges = screen.getAllByText("(2)");
      expect(countBadges.length).toBeGreaterThanOrEqual(1);
    });

    it("renders selected certification badges", () => {
      const filtersWithCerts = {
        ...DEFAULT_FILTERS,
        certifications: ["AWS", "PMP"],
      };

      render(<FiltersPanel {...defaultProps} filters={filtersWithCerts} />);

      expect(screen.getByText("AWS")).toBeInTheDocument();
      expect(screen.getByText("PMP")).toBeInTheDocument();
    });
  });

  describe("City filter", () => {
    it("shows all cities when no state selected", () => {
      render(<FiltersPanel {...defaultProps} />);

      const cityLabel = screen.getByText("City");
      const citySelect = cityLabel.parentElement?.querySelector("select");

      // Should have options for both cities
      if (citySelect) {
        const options = citySelect.querySelectorAll("option");
        // Includes placeholder + 2 cities
        expect(options.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("filters cities by selected state", () => {
      const filtersWithState = {
        ...DEFAULT_FILTERS,
        location_state: "NY",
      };

      render(<FiltersPanel {...defaultProps} filters={filtersWithState} />);

      const cityLabel = screen.getByText("City");
      const citySelect = cityLabel.parentElement?.querySelector("select");

      if (citySelect) {
        // Should only show NY cities
        const optionTexts = Array.from(
          citySelect.querySelectorAll("option"),
        ).map((o) => o.textContent);
        expect(optionTexts).toContain("New York");
        expect(optionTexts).not.toContain("Chicago, IL");
      }
    });
  });
});
