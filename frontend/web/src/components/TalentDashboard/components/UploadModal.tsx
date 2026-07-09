import { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MinusCircle,
  X,
} from "lucide-react";
import { useBatchUpload } from "@/hooks/useBatchUpload";
import {
  addFilesToSelection,
  formatFileSize,
  MAX_BATCH_FILES,
} from "@/lib/upload";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
}

export function UploadModal({ isOpen, onClose, onUpload }: UploadModalProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [skippedMessages, setSkippedMessages] = useState<string[]>([]);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [allSucceeded, setAllSucceeded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { items, isUploading, rateLimitNotice, startUpload, reset } =
    useBatchUpload({ uploadFn: onUpload });

  const resetAll = useCallback(() => {
    setSelectedFiles([]);
    setSkippedMessages([]);
    setSummaryText(null);
    setAllSucceeded(false);
    reset();
  }, [reset]);

  const handleClose = useCallback(() => {
    if (isUploading) return;
    resetAll();
    onClose();
  }, [isUploading, resetAll, onClose]);

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (isUploading || summaryText) return;
      setSelectedFiles((prev) => {
        const { accepted, skipped } = addFilesToSelection(prev, incoming);
        setSkippedMessages(skipped);
        return accepted;
      });
    },
    [isUploading, summaryText],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    // Reset input so re-selecting the same file triggers onChange
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) return;
    setSkippedMessages([]);
    const summary = await startUpload(selectedFiles);

    if (summary.succeeded === summary.total) {
      setAllSucceeded(true);
      setSummaryText(
        summary.total === 1
          ? "Uploaded! Processing will begin shortly."
          : `All ${summary.total} resumes uploaded! Processing will begin shortly.`,
      );
      setTimeout(() => {
        resetAll();
        onClose();
      }, 1500);
    } else {
      setSummaryText(
        `${summary.succeeded} of ${summary.total} uploaded. ` +
          (summary.rateLimited
            ? "Request limit reached — wait a few minutes, then retry the remaining files."
            : "Check the errors below and retry the failed files."),
      );
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "uploading":
        return <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-success shrink-0" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive shrink-0" />;
      case "blocked":
        return <MinusCircle className="h-4 w-4 text-muted-foreground shrink-0" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground shrink-0" />;
    }
  };

  if (!isOpen) return null;

  const started = items.length > 0;
  const uploadLabel =
    selectedFiles.length > 1
      ? `Upload ${selectedFiles.length} Resumes`
      : "Upload Resume";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Upload Resumes
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Drop PDF or DocX files here, or click to browse. Up to{" "}
                {MAX_BATCH_FILES} files per batch.
              </p>
            </div>

            {/* File Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
                ${
                  isDragOver
                    ? "border-primary bg-accent"
                    : "border-border-strong hover:border-muted-foreground"
                }
              `}
            >
              <div className="space-y-2">
                <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  Click to browse or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF or DocX files only &middot; Max 10 MB each
                </p>
              </div>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf, .docx, .doc"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Selected files */}
            {selectedFiles.length > 0 && (
              <ul className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border p-2">
                {selectedFiles.map((file, index) => {
                  const item = started ? items[index] : undefined;
                  return (
                    <li
                      key={`${file.name}-${file.size}`}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                    >
                      {statusIcon(item?.status ?? "queued")}
                      <span className="flex-1 truncate text-foreground">
                        {file.name}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatFileSize(file.size)}
                      </span>
                      {item?.error && (
                        <span className="text-xs text-destructive truncate max-w-[10rem]">
                          {item.error}
                        </span>
                      )}
                      {!started && !isUploading && (
                        <button
                          type="button"
                          aria-label={`Remove ${file.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(index);
                          }}
                          className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Batch processing hint */}
            {selectedFiles.length > 3 && !summaryText && (
              <p className="text-xs text-muted-foreground">
                Each resume is processed by AI individually — large batches may
                take several minutes to appear in the dashboard.
              </p>
            )}

            {/* Skipped files */}
            {skippedMessages.length > 0 && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 space-y-0.5">
                {skippedMessages.map((msg) => (
                  <p key={msg} className="text-sm text-destructive">
                    {msg}
                  </p>
                ))}
              </div>
            )}

            {/* Rate limit notice */}
            {rateLimitNotice && (
              <div className="rounded-lg bg-warning/10 border border-warning/20 px-3 py-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-warning shrink-0" />
                <p className="text-sm text-foreground">{rateLimitNotice}</p>
              </div>
            )}

            {/* Result summary */}
            {summaryText && (
              <div
                className={`rounded-lg px-3 py-2 flex items-center gap-2 border ${
                  allSucceeded
                    ? "bg-success/10 border-success/20"
                    : "bg-destructive/10 border-destructive/20"
                }`}
              >
                {allSucceeded ? (
                  <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                )}
                <p
                  className={`text-sm ${allSucceeded ? "text-success" : "text-destructive"}`}
                >
                  {summaryText}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={isUploading}
                className="flex-1 h-9 px-4 rounded-lg border border-border bg-secondary text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {summaryText && !allSucceeded ? "Close" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  selectedFiles.length === 0 ||
                  isUploading ||
                  summaryText !== null
                }
                className="flex-1 h-9 px-4 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : allSucceeded ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Done
                  </>
                ) : (
                  uploadLabel
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
