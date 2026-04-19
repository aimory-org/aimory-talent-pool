/**
 * Tests for JdTable component
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../utils";
import userEvent from "@testing-library/user-event";
import { JdTable } from "@/components/JobDescriptions/components/JdTable";
import type { JobDescription } from "@/types/jobDescription";

const mockJd: JobDescription = {
  pk: "jd-001",
  title: "Senior Python Engineer",
  required_skills: ["Python", "AWS"],
  desired_skills: ["Terraform"],
  required_certifications: [],
  desired_certifications: [],
  required_clearance: "Secret",
  min_experience_years: 5,
  location: { city: "Herndon", state: "VA", remote: "Hybrid" },
  location_state: "VA",
  industry_category: "Technology",
  job_title: "Software Engineer",
  salary_range: { min: 120000, max: 160000 },
  skill_names: "Python,AWS,Terraform",
  cert_names: "",
  bucket: "bucket",
  key: "job-descriptions/raw/jd1.pdf",
  created_at: "2025-06-01T12:00:00Z",
  updated_at: "2025-06-01T12:00:00Z",
};

const defaultProps = {
  jobDescriptions: [mockJd],
  isLoading: false,
  sortField: "title" as const,
  sortDirection: "asc" as const,
  onSort: vi.fn(),
  onSelectJd: vi.fn(),
  activeFilterCount: 0,
  onClearFilters: vi.fn(),
};

describe("JdTable", () => {
  it("renders table with job description data", () => {
    render(<JdTable {...defaultProps} />);
    expect(screen.getByText("Senior Python Engineer")).toBeInTheDocument();
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
  });

  it("renders sortable column headers", () => {
    render(<JdTable {...defaultProps} />);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Clearance")).toBeInTheDocument();
    expect(screen.getByText("Location")).toBeInTheDocument();
  });

  it("shows skills pills", () => {
    render(<JdTable {...defaultProps} />);
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("AWS")).toBeInTheDocument();
  });

  it("shows clearance badge", () => {
    render(<JdTable {...defaultProps} />);
    expect(screen.getByText("Secret")).toBeInTheDocument();
  });

  it("calls onSelectJd when row is clicked", async () => {
    const onSelectJd = vi.fn();
    render(<JdTable {...defaultProps} onSelectJd={onSelectJd} />);
    await userEvent.click(screen.getByText("Senior Python Engineer"));
    expect(onSelectJd).toHaveBeenCalledWith(mockJd);
  });

  it("shows empty state when no job descriptions", () => {
    render(<JdTable {...defaultProps} jobDescriptions={[]} />);
    expect(screen.getByText(/no job descriptions/i)).toBeInTheDocument();
  });

  it("shows clear filters hint when filters active and no results", () => {
    render(
      <JdTable {...defaultProps} jobDescriptions={[]} activeFilterCount={2} />,
    );
    expect(
      screen.getByRole("button", { name: /clear all filters/i }),
    ).toBeInTheDocument();
  });

  it("calls onSort when header clicked", async () => {
    const onSort = vi.fn();
    render(<JdTable {...defaultProps} onSort={onSort} />);
    await userEvent.click(screen.getByText("Title"));
    expect(onSort).toHaveBeenCalledWith("title");
  });

  it("formats salary range correctly", () => {
    render(<JdTable {...defaultProps} />);
    expect(screen.getByText("$120k–$160k")).toBeInTheDocument();
  });

  it("shows loading skeleton when loading", () => {
    render(<JdTable {...defaultProps} isLoading={true} jobDescriptions={[]} />);
    expect(screen.getByText(/loading job descriptions/i)).toBeInTheDocument();
  });
});
