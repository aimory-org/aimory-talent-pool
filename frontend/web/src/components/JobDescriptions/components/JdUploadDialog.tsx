/**
 * JdUploadDialog - Drag-and-drop multi-file upload dialog for job descriptions.
 */
import { useState, useCallback, useRef } from "react";
import {
  Upload,
  X,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  MinusCircle,
} from "lucide-react";
import { uploadJobDescription } from "@/lib/api";
import { useBatchUpload } from "@/hooks/useBatchUpload";
import {
  addFilesToSelection,
  formatFileSize,
  MAX_BATCH_FILES,
} from "@/lib/upload";

interface JdUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

async function uploadOne(file: File): Promise<void> {
  await uploadJobDescription(file);
}

export function JdUploadDialog({
  open,
  onClose,
  onUploaded,
}: JdUploadDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [skippedMessages, setSkippedMessages] = useState<string[]>([]);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [allSucceeded, setAllSucceeded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { items, isUploading, rateLimitNotice, startUpload, reset } =
    useBatchUpload({ uploadFn: uploadOne });

  const resetAll = useCallback(() => {
    setFiles([]);
    setSkippedMessages([]);
    setSummaryText(null);
    setAllSucceeded(false);
    setDragOver(false);
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
      setFiles((prev) => {
        const { accepted, skipped } = addFilesToSelection(prev, incoming);
        setSkippedMessages(skipped);
        return accepted;
      });
    },
    [isUploading, summaryText],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      addFiles(Array.from(e.dataTransfer.files));
    },
    [addFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      addFiles(Array.from(e.target.files ?? []));
      // Reset input so re-selecting the same file triggers onChange
      e.target.value = "";
    },
    [addFiles],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
    if (files.length === 0) return;
    setSkippedMessages([]);
    const summary = await startUpload(files);

    if (summary.succeeded > 0) onUploaded();

    if (summary.succeeded === summary.total) {
      setAllSucceeded(true);
      setSummaryText(
        summary.total === 1
          ? "Uploaded! Processing will begin shortly."
          : `All ${summary.total} files uploaded! Processing will begin shortly.`,
      );
      setTimeout(() => {
        resetAll();
        onClose();
      }, 1200);
    } else {
      setSummaryText(
        `${summary.succeeded} of ${summary.total} uploaded. ` +
          (summary.rateLimited
            ? "Request limit reached — wait a few minutes, then retry the remaining files."
            : "Check the errors below and retry the failed files."),
      );
    }
  }, [files, startUpload, onUploaded, resetAll, onClose]);

  const statusIcon = (status?: string) => {
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

  if (!open) return null;

  const started = items.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative bg-card rounded-2xl border border-border shadow-xl w-full max-w-md mx-4 p-6 animate-slide-in-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-accent rounded-lg">
              <Upload className="h-4 w-4 text-accent-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Upload Job Descriptions
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-primary bg-accent"
              : "border-border-strong hover:border-primary/40 hover:bg-accent"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            multiple
            onChange={handleInputChange}
            className="hidden"
          />

          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-foreground/60 font-medium">
              Drop files here or click to browse
            </p>
            <p className="text-xs text-foreground/30">
              PDF, DOC, or DOCX &middot; Max 10 MB each &middot; Up to{" "}
              {MAX_BATCH_FILES} files
            </p>
          </div>
        </div>

        {/* Selected files */}
        {files.length > 0 && (
          <ul className="mt-3 max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border p-2">
            {files.map((file, index) => {
              const item = started ? items[index] : undefined;
              return (
                <li
                  key={`${file.name}-${file.size}`}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                >
                  {statusIcon(item?.status)}
                  <span className="flex-1 truncate text-foreground">
                    {file.name}
                  </span>
                  <span className="text-xs text-foreground/40 shrink-0">
                    {formatFileSize(file.size)}
                  </span>
                  {item?.error && (
                    <span className="text-xs text-destructive truncate max-w-[10rem]">
                      {item.error}
                    </span>
                  )}
                  {!started && !isUploading && (
                    <button
                      aria-label={`Remove ${file.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(index);
                      }}
                      className="p-0.5 rounded text-foreground/40 hover:text-destructive transition-colors"
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
        {files.length > 3 && !summaryText && (
          <p className="mt-2 text-xs text-muted-foreground">
            Each file is processed by AI individually — large batches may take
            several minutes to appear in the list.
          </p>
        )}

        {/* Skipped files */}
        {skippedMessages.length > 0 && (
          <div className="mt-3 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 space-y-0.5">
            {skippedMessages.map((msg) => (
              <p key={msg} className="text-sm text-destructive">
                {msg}
              </p>
            ))}
          </div>
        )}

        {/* Rate limit notice */}
        {rateLimitNotice && (
          <div className="mt-3 rounded-lg bg-warning/10 border border-warning/20 px-3 py-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-warning shrink-0" />
            <p className="text-sm text-foreground">{rateLimitNotice}</p>
          </div>
        )}

        {/* Result summary */}
        {summaryText && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 flex items-center gap-2 border ${
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

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {summaryText && !allSucceeded ? "Close" : "Cancel"}
          </button>
          <button
            onClick={handleUpload}
            disabled={files.length === 0 || isUploading || summaryText !== null}
            className="px-4 py-2 rounded-lg bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground text-sm font-medium transition-colors flex items-center gap-2"
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
              <>
                <Upload className="h-4 w-4" />
                {files.length > 1 ? `Upload ${files.length} Files` : "Upload"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
