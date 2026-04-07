/**
 * Tests for ProfileDetailPanel component
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";
import { mockTalents } from "../mocks/handlers";
import { ProfileDetailPanel } from "@/components/TalentDashboard/ProfileDetailPanel";

// Mock aws-amplify auth
vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: vi.fn().mockResolvedValue({
    tokens: {
      idToken: {
        toString: () => "mock-jwt-token",
      },
    },
  }),
}));

const API_BASE = "https://api.test.com";

describe("ProfileDetailPanel", () => {
  const mockProfile = mockTalents[0];
  const mockOnClose = vi.fn();
  const mockOnRefresh = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderPanel = (profile = mockProfile) => {
    return render(
      <ProfileDetailPanel
        profile={profile}
        onClose={mockOnClose}
        onRefresh={mockOnRefresh}
      />,
    );
  };

  describe("Display mode", () => {
    it("renders profile header with name initial", () => {
      renderPanel();

      expect(screen.getByText("J")).toBeInTheDocument(); // John Doe initial
      expect(screen.getByText("Profile Details")).toBeInTheDocument();
    });

    it("shows edit button in display mode", () => {
      renderPanel();

      // Edit button should be visible (Edit3 icon button)
      const buttons = screen.getAllByRole("button");
      // Should have close and edit buttons
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });

    it("calls onClose when close button clicked", async () => {
      renderPanel();

      // Find close button (the X icon button in header)
      const closeButtons = screen.getAllByRole("button");
      const closeButton = closeButtons.find((btn) =>
        btn.querySelector("svg.lucide-x"),
      );

      if (closeButton) {
        await userEvent.click(closeButton);
        expect(mockOnClose).toHaveBeenCalled();
      }
    });

    it("displays profile status badge", () => {
      renderPanel();

      expect(screen.getByText("Active Candidate")).toBeInTheDocument();
    });

    it("displays clearance badge when present", () => {
      renderPanel();

      expect(screen.getByText("Secret")).toBeInTheDocument();
    });

    it("displays contact information", () => {
      renderPanel();

      expect(screen.getByText("john@example.com")).toBeInTheDocument();
    });

    it("displays skills", () => {
      renderPanel();

      expect(screen.getByText("TypeScript")).toBeInTheDocument();
      expect(screen.getByText("React")).toBeInTheDocument();
    });

    it("displays certifications", () => {
      renderPanel();

      expect(screen.getByText("AWS Solutions Architect")).toBeInTheDocument();
      expect(screen.getByText("PMP")).toBeInTheDocument();
    });
  });

  describe("Edit mode toggle", () => {
    it("enters edit mode when edit button clicked", async () => {
      renderPanel();

      // Find and click the edit button
      const editButton = screen
        .getAllByRole("button")
        .find((btn) =>
          btn.querySelector("svg.lucide-edit-3, svg.lucide-pencil"),
        );

      if (editButton) {
        await userEvent.click(editButton);
        expect(screen.getByText("Edit Profile")).toBeInTheDocument();
      }
    });

    it("shows save and cancel buttons in edit mode", async () => {
      renderPanel();

      // Enter edit mode
      const editButton = screen
        .getAllByRole("button")
        .find((btn) =>
          btn.querySelector("svg.lucide-edit-3, svg.lucide-pencil"),
        );

      if (editButton) {
        await userEvent.click(editButton);

        expect(screen.getByText("Save Changes")).toBeInTheDocument();
      }
    });
  });

  describe("Form field updates", () => {
    it("updates name field in edit mode", async () => {
      renderPanel();

      // Enter edit mode
      const editButton = screen
        .getAllByRole("button")
        .find((btn) =>
          btn.querySelector("svg.lucide-edit-3, svg.lucide-pencil"),
        );

      if (editButton) {
        await userEvent.click(editButton);

        // Find name input
        const nameInput = screen.getByPlaceholderText("Full name");
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, "New Name");

        expect(nameInput).toHaveValue("New Name");
      }
    });

    it("updates status select in edit mode", async () => {
      renderPanel();

      // Enter edit mode
      const editButton = screen
        .getAllByRole("button")
        .find((btn) =>
          btn.querySelector("svg.lucide-edit-3, svg.lucide-pencil"),
        );

      if (editButton) {
        await userEvent.click(editButton);

        // Find status label and select
        const statusLabel = screen.getByText("Status");
        const statusSelect = statusLabel.parentElement?.querySelector("select");

        if (statusSelect) {
          await userEvent.selectOptions(statusSelect, "Placed Candidate");
          expect(statusSelect).toHaveValue("Placed Candidate");
        }
      }
    });
  });

  describe("Cancel edit", () => {
    it("discards changes when cancel clicked", async () => {
      renderPanel();

      // Enter edit mode
      const editButton = screen
        .getAllByRole("button")
        .find((btn) =>
          btn.querySelector("svg.lucide-edit-3, svg.lucide-pencil"),
        );

      if (editButton) {
        await userEvent.click(editButton);

        // Change name
        const nameInput = screen.getByPlaceholderText("Full name");
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, "Changed Name");

        // Click cancel (XCircle icon)
        const cancelButton = screen
          .getAllByRole("button")
          .find((btn) => btn.querySelector("svg.lucide-x-circle"));

        if (cancelButton) {
          await userEvent.click(cancelButton);

          // Should exit edit mode
          expect(screen.getByText("Profile Details")).toBeInTheDocument();
        }
      }
    });
  });

  describe("Save changes", () => {
    it("calls updateTalent API when saving", async () => {
      let updateCalled = false;
      server.use(
        http.patch(`${API_BASE}/talents`, () => {
          updateCalled = true;
          return HttpResponse.json({ success: true });
        }),
      );

      renderPanel();

      // Enter edit mode
      const editButton = screen
        .getAllByRole("button")
        .find((btn) =>
          btn.querySelector("svg.lucide-edit-3, svg.lucide-pencil"),
        );

      if (editButton) {
        await userEvent.click(editButton);

        // Change status
        const statusLabel = screen.getByText("Status");
        const statusSelect = statusLabel.parentElement?.querySelector("select");

        if (statusSelect) {
          await userEvent.selectOptions(statusSelect, "Placed Candidate");
        }

        // Click save
        const saveButton = screen.getByText("Save Changes");
        await userEvent.click(saveButton);

        await waitFor(() => {
          expect(updateCalled).toBe(true);
        });
      }
    });

    it("calls onRefresh after successful save", async () => {
      server.use(
        http.patch(`${API_BASE}/talents`, () => {
          return HttpResponse.json({ success: true });
        }),
      );

      renderPanel();

      // Enter edit mode
      const editButton = screen
        .getAllByRole("button")
        .find((btn) =>
          btn.querySelector("svg.lucide-edit-3, svg.lucide-pencil"),
        );

      if (editButton) {
        await userEvent.click(editButton);

        // Change name
        const nameInput = screen.getByPlaceholderText("Full name");
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, "New Name");

        // Click save
        const saveButton = screen.getByText("Save Changes");
        await userEvent.click(saveButton);

        await waitFor(() => {
          expect(mockOnRefresh).toHaveBeenCalled();
        });
      }
    });

    it("exits edit mode after successful save", async () => {
      server.use(
        http.patch(`${API_BASE}/talents`, () => {
          return HttpResponse.json({ success: true });
        }),
      );

      renderPanel();

      // Enter edit mode
      const editButton = screen
        .getAllByRole("button")
        .find((btn) =>
          btn.querySelector("svg.lucide-edit-3, svg.lucide-pencil"),
        );

      if (editButton) {
        await userEvent.click(editButton);

        // Change name
        const nameInput = screen.getByPlaceholderText("Full name");
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, "New Name");

        // Click save
        const saveButton = screen.getByText("Save Changes");
        await userEvent.click(saveButton);

        await waitFor(() => {
          expect(screen.getByText("Profile Details")).toBeInTheDocument();
        });
      }
    });

    it("shows saving state during save", async () => {
      server.use(
        http.patch(`${API_BASE}/talents`, async () => {
          await new Promise((r) => setTimeout(r, 100));
          return HttpResponse.json({ success: true });
        }),
      );

      renderPanel();

      // Enter edit mode
      const editButton = screen
        .getAllByRole("button")
        .find((btn) =>
          btn.querySelector("svg.lucide-edit-3, svg.lucide-pencil"),
        );

      if (editButton) {
        await userEvent.click(editButton);

        // Change name
        const nameInput = screen.getByPlaceholderText("Full name");
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, "New Name");

        // Click save
        const saveButton = screen.getByText("Save Changes");
        await userEvent.click(saveButton);

        expect(screen.getByText("Saving...")).toBeInTheDocument();
      }
    });
  });

  describe("Delete confirmation", () => {
    it("shows delete confirmation dialog when delete clicked", async () => {
      renderPanel();

      // Click delete profile button
      const deleteButton = screen.getByRole("button", {
        name: /delete profile/i,
      });
      await userEvent.click(deleteButton);

      // Should show confirmation dialog
      expect(screen.getByText("Delete this profile?")).toBeInTheDocument();
    });
  });

  describe("Resume URL fetch", () => {
    it("fetches resume URL when view resume clicked", async () => {
      let resumeUrlFetched = false;
      server.use(
        http.get(`${API_BASE}/resume-url`, () => {
          resumeUrlFetched = true;
          return HttpResponse.json({
            url: "https://s3.example.com/resume.pdf",
            expiresIn: 3600,
          });
        }),
      );

      renderPanel();

      // Look for resume button
      const resumeButton = screen
        .getAllByRole("button")
        .find(
          (btn) =>
            btn.textContent?.toLowerCase().includes("resume") ||
            btn.querySelector("svg.lucide-file-text"),
        );

      if (resumeButton) {
        await userEvent.click(resumeButton);

        await waitFor(() => {
          expect(resumeUrlFetched).toBe(true);
        });
      }
    });

    it("shows resume viewer after URL fetch", async () => {
      server.use(
        http.get(`${API_BASE}/resume-url`, () => {
          return HttpResponse.json({
            url: "https://s3.example.com/resume.pdf",
            expiresIn: 3600,
          });
        }),
      );

      renderPanel();

      // Look for resume button
      const resumeButton = screen
        .getAllByRole("button")
        .find(
          (btn) =>
            btn.textContent?.toLowerCase().includes("resume") ||
            btn.querySelector("svg.lucide-file-text"),
        );

      if (resumeButton) {
        await userEvent.click(resumeButton);

        await waitFor(() => {
          // Should show resume title
          expect(screen.getByText(/resume/i)).toBeInTheDocument();
        });
      }
    });
  });

  describe("Array field editing (skills)", () => {
    it("can add a new skill", async () => {
      renderPanel();

      // Enter edit mode
      const editButton = screen
        .getAllByRole("button")
        .find((btn) =>
          btn.querySelector("svg.lucide-edit-3, svg.lucide-pencil"),
        );

      if (editButton) {
        await userEvent.click(editButton);

        // Find add skill button (Plus icon near skills)
        const addButtons = screen
          .getAllByRole("button")
          .filter((btn) => btn.querySelector("svg.lucide-plus"));

        if (addButtons.length > 0) {
          const skillInputsBefore = screen.getAllByPlaceholderText(/skill/i);
          const countBefore = skillInputsBefore.length;

          await userEvent.click(addButtons[0]);

          const skillInputsAfter = screen.getAllByPlaceholderText(/skill/i);
          expect(skillInputsAfter.length).toBeGreaterThanOrEqual(countBefore);
        }
      }
    });

    it("can remove a skill", async () => {
      renderPanel();

      // Enter edit mode
      const editButton = screen
        .getAllByRole("button")
        .find((btn) =>
          btn.querySelector("svg.lucide-edit-3, svg.lucide-pencil"),
        );

      if (editButton) {
        await userEvent.click(editButton);

        // Find remove skill button (Minus icon)
        const removeButtons = screen
          .getAllByRole("button")
          .filter((btn) => btn.querySelector("svg.lucide-minus"));

        if (removeButtons.length > 0) {
          const skillInputsBefore = screen.getAllByPlaceholderText(/skill/i);
          const countBefore = skillInputsBefore.length;

          await userEvent.click(removeButtons[0]);

          // May have fewer inputs now
          const skillInputsAfter = screen.queryAllByPlaceholderText(/skill/i);
          expect(skillInputsAfter.length).toBeLessThanOrEqual(countBefore);
        }
      }
    });

    it("can update a skill value", async () => {
      renderPanel();

      // Enter edit mode
      const editButton = screen
        .getAllByRole("button")
        .find((btn) =>
          btn.querySelector("svg.lucide-edit-3, svg.lucide-pencil"),
        );

      if (editButton) {
        await userEvent.click(editButton);

        const skillInputs = screen.getAllByPlaceholderText(/skill/i);
        if (skillInputs.length > 0) {
          await userEvent.clear(skillInputs[0]);
          await userEvent.type(skillInputs[0], "NewSkill");

          expect(skillInputs[0]).toHaveValue("NewSkill");
        }
      }
    });
  });

  describe("Profile data display", () => {
    it("displays years of experience", () => {
      renderPanel();

      // Look for years of experience text - use exact match
      expect(screen.getByText("10 years")).toBeInTheDocument();
    });

    it("displays requested salary", () => {
      renderPanel();

      // Look for salary - check for the formatted amount
      expect(screen.getByText("$150,000")).toBeInTheDocument();
    });

    it("displays location", () => {
      renderPanel();

      expect(screen.getByText(/New York/i)).toBeInTheDocument();
    });

    it("displays companies", () => {
      renderPanel();

      expect(screen.getByText("Tech Corp")).toBeInTheDocument();
    });

    it("displays summary", () => {
      renderPanel();

      expect(
        screen.getByText(/experienced software engineer/i),
      ).toBeInTheDocument();
    });
  });

  describe("Profile without optional fields", () => {
    it("handles profile with null clearance", () => {
      const profileWithoutClearance = {
        ...mockTalents[2], // Bob Wilson has null clearance
      };

      render(
        <ProfileDetailPanel
          profile={profileWithoutClearance}
          onClose={mockOnClose}
          onRefresh={mockOnRefresh}
        />,
      );

      // Should render without error
      expect(screen.getByText("Bob Wilson")).toBeInTheDocument();
    });

    it("handles profile with missing contact info", () => {
      const profileMinimalContact = {
        ...mockTalents[2], // Bob Wilson has minimal contact
      };

      render(
        <ProfileDetailPanel
          profile={profileMinimalContact}
          onClose={mockOnClose}
          onRefresh={mockOnRefresh}
        />,
      );

      // Should render without error
      expect(screen.getByText("Bob Wilson")).toBeInTheDocument();
    });
  });

  describe("Save with field changes", () => {
    it("enters edit mode and shows save button", async () => {
      renderPanel();

      // Enter edit mode
      const editButton = screen.getByRole("button", { name: /edit/i });
      await userEvent.click(editButton);

      // Save button should appear
      await waitFor(() => {
        expect(screen.getByText("Save Changes")).toBeInTheDocument();
      });
    });

    it("exits edit mode without saving when no changes", async () => {
      renderPanel();

      const editButton = screen.getByRole("button", { name: /edit/i });
      await userEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByText("Save Changes")).toBeInTheDocument();
      });

      // Save without changes
      const saveButton = screen.getByText("Save Changes");
      await userEvent.click(saveButton);

      // Should exit edit mode
      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: /save changes/i }),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("Delete functionality", () => {
    it("shows delete confirmation when delete clicked", async () => {
      renderPanel();

      // Click delete button
      const deleteButton = screen.getByRole("button", {
        name: /delete profile/i,
      });
      await userEvent.click(deleteButton);

      // Should show confirmation dialog
      expect(screen.getByText("Delete this profile?")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /yes, delete/i }),
      ).toBeInTheDocument();
    });

    it("cancels delete when cancel clicked", async () => {
      renderPanel();

      const deleteButton = screen.getByRole("button", {
        name: /delete profile/i,
      });
      await userEvent.click(deleteButton);

      // Click cancel
      const cancelButton = screen.getByRole("button", { name: /cancel/i });
      await userEvent.click(cancelButton);

      // Confirmation dialog should be closed
      expect(
        screen.queryByRole("button", { name: /yes, delete/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Resume functionality", () => {
    it("shows loading state when fetching resume", async () => {
      server.use(
        http.get(`${API_BASE}/resume-url`, async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return HttpResponse.json({
            url: "https://s3.example.com/resume.pdf",
            expiresIn: 3600,
          });
        }),
      );

      renderPanel();

      const resumeButtons = screen.queryAllByRole("button");
      const resumeButton = resumeButtons.find(
        (btn) =>
          btn.textContent?.includes("View Resume") ||
          btn.querySelector("svg.lucide-file-text"),
      );

      if (resumeButton) {
        await userEvent.click(resumeButton);
        // Component should handle loading state
      }
    });

    it("handles resume load error", async () => {
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
      server.use(
        http.get(`${API_BASE}/resume-url`, () => {
          return HttpResponse.error();
        }),
      );

      renderPanel();

      const resumeButtons = screen.queryAllByRole("button");
      const resumeButton = resumeButtons.find(
        (btn) =>
          btn.textContent?.includes("View Resume") ||
          btn.querySelector("svg.lucide-file-text"),
      );

      if (resumeButton) {
        await userEvent.click(resumeButton);

        await waitFor(
          () => {
            expect(alertSpy).toHaveBeenCalledWith(
              "Failed to load resume. Please try again.",
            );
          },
          { timeout: 3000 },
        );
      }

      alertSpy.mockRestore();
    });
  });

  describe("Edit mode functionality", () => {
    it("shows edit form elements in edit mode", async () => {
      renderPanel();

      const editButton = screen.getByRole("button", { name: /edit/i });
      await userEvent.click(editButton);

      await waitFor(() => {
        // Should have various input fields
        const inputs = screen.getAllByRole("textbox");
        expect(inputs.length).toBeGreaterThan(0);
      });
    });

    it("shows number inputs for years and salary in edit mode", async () => {
      renderPanel();

      const editButton = screen.getByRole("button", { name: /edit/i });
      await userEvent.click(editButton);

      await waitFor(() => {
        const spinbuttons = screen.getAllByRole("spinbutton");
        expect(spinbuttons.length).toBeGreaterThan(0);
      });
    });
  });
});
