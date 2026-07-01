/**
 * Tests for JdDetailPanel component
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "../utils";
import userEvent from "@testing-library/user-event";
import { JdDetailPanel } from "@/components/JobDescriptions/JdDetailPanel";
import type { JobDescription } from "@/types/jobDescription";

// Mock aws-amplify auth
vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: { idToken: { toString: () => "mock-token" } },
  }),
}));

const mockJd: JobDescription = {
  pk: "jd-001",
  title: "Senior Python Engineer",
  required_skills: ["Python", "AWS"],
  desired_skills: ["Terraform"],
  required_certifications: ["AWS SAA"],
  desired_certifications: [],
  required_clearance: "Secret",
  min_experience_years: 5,
  location: { city: "Herndon", state: "VA", remote: "Hybrid" },
  location_state: "VA",
  industry_category: "Technology",
  job_title: "Software Engineer",
  salary_range: { min: 120000, max: 160000 },
  skill_names: "Python,AWS,Terraform",
  cert_names: "AWS SAA",
  bucket: "bucket",
  key: "job-descriptions/raw/jd1.pdf",
  created_at: "2025-06-01T12:00:00Z",
  updated_at: "2025-06-01T12:00:00Z",
};

describe("JdDetailPanel", () => {
  const onClose = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders job description title", () => {
    render(
      <JdDetailPanel jd={mockJd} onClose={onClose} onDeleted={onDeleted} />,
    );
    expect(screen.getByText("Senior Python Engineer")).toBeInTheDocument();
  });

  it("renders required skills as tags", () => {
    render(
      <JdDetailPanel jd={mockJd} onClose={onClose} onDeleted={onDeleted} />,
    );
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("AWS")).toBeInTheDocument();
  });

  it("renders desired skills as tags", () => {
    render(
      <JdDetailPanel jd={mockJd} onClose={onClose} onDeleted={onDeleted} />,
    );
    expect(screen.getByText("Terraform")).toBeInTheDocument();
  });

  it("renders clearance badge", () => {
    render(
      <JdDetailPanel jd={mockJd} onClose={onClose} onDeleted={onDeleted} />,
    );
    expect(screen.getByText("Secret")).toBeInTheDocument();
  });

  it("renders salary range", () => {
    render(
      <JdDetailPanel jd={mockJd} onClose={onClose} onDeleted={onDeleted} />,
    );
    expect(screen.getByText(/120,000/)).toBeInTheDocument();
    expect(screen.getByText(/160,000/)).toBeInTheDocument();
  });

  it("renders minimum experience", () => {
    render(
      <JdDetailPanel jd={mockJd} onClose={onClose} onDeleted={onDeleted} />,
    );
    expect(screen.getByText(/5\+ years/)).toBeInTheDocument();
  });

  it("renders location", () => {
    render(
      <JdDetailPanel jd={mockJd} onClose={onClose} onDeleted={onDeleted} />,
    );
    expect(screen.getByText(/Herndon/)).toBeInTheDocument();
    expect(screen.getByText(/VA/)).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <JdDetailPanel jd={mockJd} onClose={onClose} onDeleted={onDeleted} />,
    );
    // Close button is the X icon button in the header
    const buttons = screen.getAllByRole("button");
    // First button in the panel is the close button
    await user.click(buttons[0]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows match candidates button", () => {
    render(
      <JdDetailPanel jd={mockJd} onClose={onClose} onDeleted={onDeleted} />,
    );
    expect(
      screen.getByRole("button", { name: /find matches/i }),
    ).toBeInTheDocument();
  });

  it("triggers matching and shows results", async () => {
    const user = userEvent.setup();
    render(
      <JdDetailPanel jd={mockJd} onClose={onClose} onDeleted={onDeleted} />,
    );
    const matchBtn = screen.getByRole("button", { name: /find matches/i });
    await user.click(matchBtn);
    // MSW handler returns mockCandidateMatches — wait for results to appear
    await waitFor(
      () => {
        expect(screen.getByText("John Doe")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("shows matched vs missing breakdown after opening a match", async () => {
    const user = userEvent.setup();
    render(
      <JdDetailPanel jd={mockJd} onClose={onClose} onDeleted={onDeleted} />,
    );

    const matchBtn = screen.getByRole("button", { name: /find matches/i });
    await user.click(matchBtn);

    await waitFor(
      () => {
        expect(screen.getByText("John Doe")).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    const matchCard = screen.getByRole("button", { name: /john doe/i });
    await user.click(matchCard);

    await waitFor(() => {
      expect(screen.getByText("Match Breakdown")).toBeInTheDocument();
    });
    expect(screen.getByText(/Not in tags: Python/i)).toBeInTheDocument();
    expect(screen.getByText(/Not Matching/i)).toBeInTheDocument();
  });

  it("shows delete confirmation on delete click", async () => {
    const user = userEvent.setup();
    render(
      <JdDetailPanel jd={mockJd} onClose={onClose} onDeleted={onDeleted} />,
    );
    // The delete button in the footer shows "Delete" text
    const deleteBtn = screen.getByRole("button", { name: /delete/i });
    await user.click(deleteBtn);
    expect(
      screen.getByText(/delete this job description/i),
    ).toBeInTheDocument();
  });

  it("renders certifications", () => {
    render(
      <JdDetailPanel jd={mockJd} onClose={onClose} onDeleted={onDeleted} />,
    );
    expect(screen.getByText("AWS SAA")).toBeInTheDocument();
  });
});
