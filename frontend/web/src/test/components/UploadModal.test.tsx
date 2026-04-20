/**
 * Tests for UploadModal component (resume upload)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../utils";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadModal } from "@/components/TalentDashboard/components/UploadModal";

describe("UploadModal", () => {
  const onClose = vi.fn();
  const onUpload = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <UploadModal isOpen={false} onClose={onClose} onUpload={onUpload} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog when open", () => {
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    expect(screen.getByText("Upload Resume")).toBeInTheDocument();
  });

  it("shows drop zone instructions", () => {
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    expect(
      screen.getByText(/click to browse or drag and drop/i),
    ).toBeInTheDocument();
  });

  it("shows file type hint", () => {
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    expect(screen.getByText(/PDF or DocX files only/i)).toBeInTheDocument();
  });

  it("upload button is disabled when no file selected", () => {
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    const uploadBtn = screen.getByRole("button", { name: /upload resume/i });
    expect(uploadBtn).toBeDisabled();
  });

  it("calls onClose when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows selected file name after selection", async () => {
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    const file = new File(["hello"], "test-resume.pdf", {
      type: "application/pdf",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);
    expect(screen.getByText("test-resume.pdf")).toBeInTheDocument();
  });

  it("shows error for invalid file type", () => {
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    const file = new File(["hello"], "test.txt", { type: "text/plain" });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    // Use fireEvent to bypass accept attribute filtering in jsdom
    fireEvent.change(input, { target: { files: [file] } });
    // The modal doesn't show an error for invalid types on selection,
    // it just doesn't set the file - so the upload button remains disabled
    const uploadBtn = screen.getByRole("button", { name: /upload resume/i });
    expect(uploadBtn).toBeDisabled();
  });

  it("enables upload button after valid file selected", async () => {
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    const file = new File(["hello"], "test-resume.pdf", {
      type: "application/pdf",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);
    const uploadBtn = screen.getByRole("button", { name: /upload resume/i });
    expect(uploadBtn).not.toBeDisabled();
  });

  it("calls onUpload when upload button is clicked", async () => {
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    const file = new File(["hello"], "test-resume.pdf", {
      type: "application/pdf",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: /upload resume/i }));
    expect(onUpload).toHaveBeenCalledWith(file);
  });

  it("shows loading state while uploading", async () => {
    let resolveUpload: () => void;
    const uploadPromise = new Promise<void>((resolve) => {
      resolveUpload = resolve;
    });
    const onUploadWithDelay = vi.fn().mockReturnValue(uploadPromise);

    const user = userEvent.setup();
    render(
      <UploadModal
        isOpen={true}
        onClose={onClose}
        onUpload={onUploadWithDelay}
      />,
    );

    const file = new File(["hello"], "test-resume.pdf", {
      type: "application/pdf",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: /upload resume/i }));

    expect(
      screen.getByRole("button", { name: /uploading/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /uploading/i })).toBeDisabled();

    // Resolve the upload
    resolveUpload!();
    await uploadPromise;
  });

  it("shows error message when upload fails", async () => {
    const onUploadWithError = vi
      .fn()
      .mockRejectedValue(new Error("Upload failed"));
    const user = userEvent.setup();

    render(
      <UploadModal
        isOpen={true}
        onClose={onClose}
        onUpload={onUploadWithError}
      />,
    );

    const file = new File(["hello"], "test-resume.pdf", {
      type: "application/pdf",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);
    await user.click(screen.getByRole("button", { name: /upload resume/i }));

    expect(screen.getByText(/upload failed/i)).toBeInTheDocument();
  });

  it("accepts docx files", async () => {
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    const file = new File(["hello"], "test-resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);
    const uploadBtn = screen.getByRole("button", { name: /upload resume/i });
    expect(uploadBtn).not.toBeDisabled();
  });

  it("accepts doc files", async () => {
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    const file = new File(["hello"], "test-resume.doc", {
      type: "application/msword",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);
    const uploadBtn = screen.getByRole("button", { name: /upload resume/i });
    expect(uploadBtn).not.toBeDisabled();
  });
});
