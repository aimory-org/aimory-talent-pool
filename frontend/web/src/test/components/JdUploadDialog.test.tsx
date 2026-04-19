/**
 * Tests for JdUploadDialog component
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../utils";
import { fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JdUploadDialog } from "@/components/JobDescriptions/components/JdUploadDialog";

describe("JdUploadDialog", () => {
  const onClose = vi.fn();
  const onUploaded = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <JdUploadDialog open={false} onClose={onClose} onUploaded={onUploaded} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog when open", () => {
    render(
      <JdUploadDialog open={true} onClose={onClose} onUploaded={onUploaded} />,
    );
    expect(screen.getByText("Upload Job Description")).toBeInTheDocument();
  });

  it("shows drop zone instructions", () => {
    render(
      <JdUploadDialog open={true} onClose={onClose} onUploaded={onUploaded} />,
    );
    expect(
      screen.getByText(/drop a file here or click to browse/i),
    ).toBeInTheDocument();
  });

  it("shows file type hint", () => {
    render(
      <JdUploadDialog open={true} onClose={onClose} onUploaded={onUploaded} />,
    );
    expect(screen.getByText(/PDF, DOC, or DOCX/)).toBeInTheDocument();
  });

  it("upload button is disabled when no file selected", () => {
    render(
      <JdUploadDialog open={true} onClose={onClose} onUploaded={onUploaded} />,
    );
    const uploadBtn = screen.getByRole("button", { name: /upload/i });
    expect(uploadBtn).toBeDisabled();
  });

  it("calls onClose when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(
      <JdUploadDialog open={true} onClose={onClose} onUploaded={onUploaded} />,
    );
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows selected file name after selection", async () => {
    const user = userEvent.setup();
    render(
      <JdUploadDialog open={true} onClose={onClose} onUploaded={onUploaded} />,
    );
    const file = new File(["hello"], "test-jd.pdf", {
      type: "application/pdf",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);
    expect(screen.getByText("test-jd.pdf")).toBeInTheDocument();
  });

  it("shows error for invalid file type", () => {
    render(
      <JdUploadDialog open={true} onClose={onClose} onUploaded={onUploaded} />,
    );
    const file = new File(["hello"], "test.txt", { type: "text/plain" });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    // Use fireEvent to bypass accept attribute filtering in jsdom
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByText(/only pdf, doc, and docx/i)).toBeInTheDocument();
  });

  it("enables upload button after valid file selected", async () => {
    const user = userEvent.setup();
    render(
      <JdUploadDialog open={true} onClose={onClose} onUploaded={onUploaded} />,
    );
    const file = new File(["hello"], "test-jd.pdf", {
      type: "application/pdf",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    await user.upload(input, file);
    const uploadBtn = screen.getByRole("button", { name: /upload/i });
    expect(uploadBtn).not.toBeDisabled();
  });
});
