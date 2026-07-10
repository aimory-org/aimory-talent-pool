/**
 * Tests for UploadModal component (multi-file resume upload)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "../utils";
import { fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadModal } from "@/components/TalentDashboard/components/UploadModal";
import { RateLimitError } from "@/lib/api";
import { MAX_BATCH_FILES } from "@/lib/upload";

const getUploadButton = () =>
  screen.getByRole("button", { name: /^upload (\d+ )?resumes?$/i });

const getFileInput = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;

const makePdf = (name: string) =>
  new File(["hello"], name, { type: "application/pdf" });

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
    expect(
      screen.getByRole("heading", { name: /upload resumes/i }),
    ).toBeInTheDocument();
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
    expect(getUploadButton()).toBeDisabled();
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
    await user.upload(getFileInput(), makePdf("test-resume.pdf"));
    expect(screen.getByText("test-resume.pdf")).toBeInTheDocument();
  });

  it("shows a skipped message for invalid file type and keeps upload disabled", () => {
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    const file = new File(["hello"], "test.txt", { type: "text/plain" });
    // Use fireEvent to bypass accept attribute filtering in jsdom
    fireEvent.change(getFileInput(), { target: { files: [file] } });
    expect(
      screen.getByText(/only pdf, doc, and docx files are supported/i),
    ).toBeInTheDocument();
    expect(getUploadButton()).toBeDisabled();
  });

  it("enables upload button after valid file selected", async () => {
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    await user.upload(getFileInput(), makePdf("test-resume.pdf"));
    expect(getUploadButton()).not.toBeDisabled();
  });

  it("calls onUpload when upload button is clicked", async () => {
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    const file = makePdf("test-resume.pdf");
    await user.upload(getFileInput(), file);
    await user.click(getUploadButton());
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(file));
  });

  it("supports selecting multiple files and uploads each one", async () => {
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    const files = [makePdf("one.pdf"), makePdf("two.pdf"), makePdf("three.pdf")];
    await user.upload(getFileInput(), files);

    expect(screen.getByText("one.pdf")).toBeInTheDocument();
    expect(screen.getByText("two.pdf")).toBeInTheDocument();
    expect(screen.getByText("three.pdf")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: /upload 3 resumes/i });
    await user.click(button);

    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(3));
    expect(
      await screen.findByText(/all 3 resumes uploaded/i),
    ).toBeInTheDocument();
  });

  it("allows removing a file before uploading", async () => {
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    await user.upload(getFileInput(), [makePdf("keep.pdf"), makePdf("drop.pdf")]);

    await user.click(screen.getByRole("button", { name: /remove drop.pdf/i }));
    expect(screen.queryByText("drop.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("keep.pdf")).toBeInTheDocument();
  });

  it("enforces the batch size cap", async () => {
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    const files = Array.from({ length: MAX_BATCH_FILES + 2 }, (_, i) =>
      makePdf(`resume-${i}.pdf`),
    );
    await user.upload(getFileInput(), files);

    expect(screen.getAllByText(/batch limit of 10 files reached/i)).toHaveLength(
      2,
    );
    expect(
      screen.getByRole("button", { name: `Upload ${MAX_BATCH_FILES} Resumes` }),
    ).toBeInTheDocument();
  });

  it("skips files over the size limit", async () => {
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    const big = makePdf("huge.pdf");
    Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
    fireEvent.change(getFileInput(), { target: { files: [big] } });

    expect(screen.getByText(/under 10 MB/i)).toBeInTheDocument();
    expect(getUploadButton()).toBeDisabled();
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

    await user.upload(getFileInput(), makePdf("test-resume.pdf"));
    await user.click(getUploadButton());

    expect(
      screen.getByRole("button", { name: /uploading/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /uploading/i })).toBeDisabled();

    // Resolve the upload
    resolveUpload!();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /uploading/i })).toBeNull(),
    );
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

    await user.upload(getFileInput(), makePdf("test-resume.pdf"));
    await user.click(getUploadButton());

    expect(await screen.findByText(/upload failed/i)).toBeInTheDocument();
    expect(await screen.findByText(/0 of 1 uploaded/i)).toBeInTheDocument();
  });

  it("stops the batch and reports when the request limit persists", async () => {
    // retryAfterSeconds: 0 keeps backoff instant in tests
    const onUploadRateLimited = vi
      .fn()
      .mockRejectedValue(new RateLimitError("throttled", 0));
    const user = userEvent.setup();

    render(
      <UploadModal
        isOpen={true}
        onClose={onClose}
        onUpload={onUploadRateLimited}
      />,
    );

    await user.upload(getFileInput(), [
      makePdf("one.pdf"),
      makePdf("two.pdf"),
      makePdf("three.pdf"),
    ]);
    await user.click(screen.getByRole("button", { name: /upload 3 resumes/i }));

    expect(
      await screen.findByText(/request limit reached\. remaining files were skipped/i),
    ).toBeInTheDocument();
    expect(await screen.findByText(/0 of 3 uploaded/i)).toBeInTheDocument();
  });

  it("accepts docx files", async () => {
    const user = userEvent.setup();
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    const file = new File(["hello"], "test-resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    await user.upload(getFileInput(), file);
    expect(getUploadButton()).not.toBeDisabled();
  });

  it("accepts doc files", async () => {
    render(<UploadModal isOpen={true} onClose={onClose} onUpload={onUpload} />);
    const file = new File(["hello"], "test-resume.doc", {
      type: "application/msword",
    });
    // Bypass input accept filtering in jsdom to exercise component MIME validation.
    fireEvent.change(getFileInput(), { target: { files: [file] } });
    expect(getUploadButton()).not.toBeDisabled();
  });
});
