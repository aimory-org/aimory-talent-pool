/**
 * Shared validation rules and limits for document uploads (resumes and
 * job descriptions).
 *
 * Every uploaded file triggers a full processing pipeline run that ends in
 * an LLM extraction call, so the batch size cap here is the first guardrail
 * against exhausting the model's request quota.
 */

export const ACCEPTED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const ACCEPTED_EXTENSIONS = [".pdf", ".doc", ".docx"];

/** Matches the backend presign Lambda's expectations. */
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Max files per batch. Each file spawns one pipeline execution with an LLM
 * extraction step; keeping batches small avoids throttling storms downstream.
 */
export const MAX_BATCH_FILES = 10;

/**
 * Validate a single file. Returns an error message, or null if the file is
 * acceptable.
 */
export function validateUploadFile(file: File): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (!ACCEPTED_EXTENSIONS.includes(ext) && !ACCEPTED_TYPES.includes(file.type)) {
    return "Only PDF, DOC, and DOCX files are supported.";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "File size must be under 10 MB.";
  }
  if (file.size === 0) {
    return "File is empty.";
  }
  return null;
}

export interface FileSelectionResult {
  /** Files accepted into the batch (existing + newly added). */
  accepted: File[];
  /** Human-readable reasons for anything that was skipped. */
  skipped: string[];
}

/**
 * Merge newly selected files into an existing batch, applying per-file
 * validation, duplicate detection (same name + size), and the batch cap.
 */
export function addFilesToSelection(
  existing: File[],
  incoming: File[],
): FileSelectionResult {
  const accepted = [...existing];
  const skipped: string[] = [];

  for (const file of incoming) {
    const error = validateUploadFile(file);
    if (error) {
      skipped.push(`${file.name}: ${error}`);
      continue;
    }
    const isDuplicate = accepted.some(
      (f) => f.name === file.name && f.size === file.size,
    );
    if (isDuplicate) {
      skipped.push(`${file.name}: already added.`);
      continue;
    }
    if (accepted.length >= MAX_BATCH_FILES) {
      skipped.push(
        `${file.name}: batch limit of ${MAX_BATCH_FILES} files reached.`,
      );
      continue;
    }
    accepted.push(file);
  }

  return { accepted, skipped };
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
