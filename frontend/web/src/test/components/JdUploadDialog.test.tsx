/**
 * Tests for JdUploadDialog component (multi-file JD upload)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../utils";
import { fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JdUploadDialog } from "@/components/JobDescriptions/components/JdUploadDialog";
import { uploadJobDescription } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    uploadJobDescription: vi.fn().mockResolvedValue("jds/raw/test-key"),
  };
});

const getFileInput = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;

const makePdf = (name: string) =>
  new File(["hello"], name, { type: "application/pdf" });

describe("JdUploadDialog", () => {
  const onClose = vi.fn();
  const onUploaded = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(uploadJobDescription).mockResolvedValue("jds/raw/test-key");
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
    expect(screen.getByText("Upload Job Descriptions")).toBeInTheDocument();
  });

  it("shows drop zone instructions", () => {
    render(
      <JdUploadDialog open={true} onClose={onClose} onUploaded={onUploaded} />,
    );
    expect(
      screen.getByText(/drop files here or click to browse/i),
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
    const uploadBtn = screen.getByRole("button", { name: /^upload/i });
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
    await user.upload(getFileInput(), makePdf("test-jd.pdf"));
    expect(screen.getByText("test-jd.pdf")).toBeInTheDocument();
  });

  it("shows error for invalid file type", () => {
    render(
      <JdUploadDialog open={true} onClose={onClose} onUploaded={onUploaded} />,
    );
    const file = new File(["hello"], "test.txt", { type: "text/plain" });
    // Use fireEvent to bypass accept attribute filtering in jsdom
    fireEvent.change(getFileInput(), { target: { files: [file] } });
    expect(screen.getByText(/only pdf, doc, and docx/i)).toBeInTheDocument();
  });

  it("enables upload button after valid file selected", async () => {
    const user = userEvent.setup();
    render(
      <JdUploadDialog open={true} onClose={onClose} onUploaded={onUploaded} />,
    );
    await user.upload(getFileInput(), makePdf("test-jd.pdf"));
    const uploadBtn = screen.getByRole("button", { name: /^upload$/i });
    expect(uploadBtn).not.toBeDisabled();
  });

  it("uploads multiple files and calls onUploaded once", async () => {
    const user = userEvent.setup();
    render(
      <JdUploadDialog open={true} onClose={onClose} onUploaded={onUploaded} />,
    );
    await user.upload(getFileInput(), [
      makePdf("jd-one.pdf"),
      makePdf("jd-two.pdf"),
    ]);

    await user.click(screen.getByRole("button", { name: /upload 2 files/i }));

    await waitFor(() =>
      expect(uploadJobDescription).toHaveBeenCalledTimes(2),
    );
    expect(onUploaded).toHaveBeenCalledOnce();
    expect(
      await screen.findByText(/all 2 files uploaded/i),
    ).toBeInTheDocument();
  });

  it("reports partial failures without closing", async () => {
    vi.mocked(uploadJobDescription)
      .mockResolvedValueOnce("jds/raw/ok-key")
      .mockRejectedValueOnce(new Error("boom"));

    const user = userEvent.setup();
    render(
      <JdUploadDialog open={true} onClose={onClose} onUploaded={onUploaded} />,
    );
    await user.upload(getFileInput(), [
      makePdf("jd-one.pdf"),
      makePdf("jd-two.pdf"),
    ]);
    await user.click(screen.getByRole("button", { name: /upload 2 files/i }));

    expect(await screen.findByText(/1 of 2 uploaded/i)).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });
});
