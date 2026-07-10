/**
 * Tests for upload validation guardrails (lib/upload.ts)
 */
import { describe, it, expect } from "vitest";
import {
  validateUploadFile,
  addFilesToSelection,
  MAX_BATCH_FILES,
  MAX_FILE_SIZE,
} from "@/lib/upload";

const makeFile = (
  name: string,
  { size = 1024, type = "application/pdf" } = {},
) => {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
};

describe("validateUploadFile", () => {
  it("accepts pdf, doc, and docx", () => {
    expect(validateUploadFile(makeFile("a.pdf"))).toBeNull();
    expect(
      validateUploadFile(makeFile("b.doc", { type: "application/msword" })),
    ).toBeNull();
    expect(
      validateUploadFile(
        makeFile("c.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      ),
    ).toBeNull();
  });

  it("rejects unsupported types", () => {
    expect(
      validateUploadFile(makeFile("notes.txt", { type: "text/plain" })),
    ).toMatch(/only pdf, doc, and docx/i);
  });

  it("rejects files over the size limit", () => {
    expect(
      validateUploadFile(makeFile("big.pdf", { size: MAX_FILE_SIZE + 1 })),
    ).toMatch(/under 10 MB/i);
  });

  it("rejects empty files", () => {
    expect(validateUploadFile(makeFile("empty.pdf", { size: 0 }))).toMatch(
      /empty/i,
    );
  });
});

describe("addFilesToSelection", () => {
  it("accepts valid files and reports skipped ones", () => {
    const { accepted, skipped } = addFilesToSelection(
      [],
      [makeFile("a.pdf"), makeFile("bad.txt", { type: "text/plain" })],
    );
    expect(accepted.map((f) => f.name)).toEqual(["a.pdf"]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toContain("bad.txt");
  });

  it("skips duplicates by name and size", () => {
    const existing = [makeFile("a.pdf")];
    const { accepted, skipped } = addFilesToSelection(existing, [
      makeFile("a.pdf"),
    ]);
    expect(accepted).toHaveLength(1);
    expect(skipped[0]).toMatch(/already added/i);
  });

  it("enforces the batch cap", () => {
    const existing = Array.from({ length: MAX_BATCH_FILES }, (_, i) =>
      makeFile(`f${i}.pdf`),
    );
    const { accepted, skipped } = addFilesToSelection(existing, [
      makeFile("overflow.pdf"),
    ]);
    expect(accepted).toHaveLength(MAX_BATCH_FILES);
    expect(skipped[0]).toMatch(/batch limit/i);
  });
});
