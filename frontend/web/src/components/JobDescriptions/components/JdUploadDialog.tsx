/**
 * JdUploadDialog - Drag-and-drop file upload dialog for job descriptions.
 */
import { useState, useCallback, useRef } from "react";
import { Upload, X, FileText, Loader2, CheckCircle2 } from "lucide-react";
import { uploadJobDescription } from "@/lib/api";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ACCEPTED_EXTENSIONS = [".pdf", ".doc", ".docx"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

type UploadState = "idle" | "uploading" | "success" | "error";

interface JdUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

export function JdUploadDialog({
  open,
  onClose,
  onUploaded,
}: JdUploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setFile(null);
    setUploadState("idle");
    setErrorMessage("");
    setDragOver(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const validateFile = useCallback((f: File): string | null => {
    const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
    if (
      !ACCEPTED_EXTENSIONS.includes(ext) &&
      !ACCEPTED_TYPES.includes(f.type)
    ) {
      return "Only PDF, DOC, and DOCX files are supported.";
    }
    if (f.size > MAX_FILE_SIZE) {
      return "File size must be under 10 MB.";
    }
    return null;
  }, []);

  const handleFileSelect = useCallback(
    (f: File) => {
      const err = validateFile(f);
      if (err) {
        setErrorMessage(err);
        setFile(null);
        return;
      }
      setErrorMessage("");
      setFile(f);
      setUploadState("idle");
    },
    [validateFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFileSelect(f);
    },
    [handleFileSelect],
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
      const f = e.target.files?.[0];
      if (f) handleFileSelect(f);
      // Reset input so re-selecting the same file triggers onChange
      e.target.value = "";
    },
    [handleFileSelect],
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setUploadState("uploading");
    setErrorMessage("");
    try {
      await uploadJobDescription(file);
      setUploadState("success");
      // Auto-close after short delay and refresh the list
      setTimeout(() => {
        handleClose();
        onUploaded();
      }, 1200);
    } catch (err) {
      setUploadState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
    }
  }, [file, handleClose, onUploaded]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl w-full max-w-md mx-4 p-6 animate-slide-in-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-violet-500/10 rounded-lg border border-violet-500/20">
              <Upload className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Upload Job Description
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-foreground/40 hover:text-foreground transition-colors"
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
          className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            dragOver
              ? "border-violet-500 bg-violet-500/10"
              : file
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-black/10 dark:border-white/10 hover:border-violet-500/40 hover:bg-violet-500/5"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={handleInputChange}
            className="hidden"
          />

          {file ? (
            <div className="flex flex-col items-center gap-2">
              <FileText className="h-8 w-8 text-emerald-500" />
              <p className="font-medium text-foreground text-sm truncate max-w-full">
                {file.name}
              </p>
              <p className="text-xs text-foreground/40">
                {(file.size / 1024).toFixed(0)} KB
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  setUploadState("idle");
                  setErrorMessage("");
                }}
                className="text-xs text-foreground/40 hover:text-red-500 transition-colors mt-1"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-foreground/20" />
              <p className="text-sm text-foreground/60 font-medium">
                Drop a file here or click to browse
              </p>
              <p className="text-xs text-foreground/30">
                PDF, DOC, or DOCX &middot; Max 10 MB
              </p>
            </div>
          )}
        </div>

        {/* Error */}
        {errorMessage && (
          <div className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
            <p className="text-sm text-red-600 dark:text-red-300">
              {errorMessage}
            </p>
          </div>
        )}

        {/* Success */}
        {uploadState === "success" && (
          <div className="mt-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <p className="text-sm text-emerald-600 dark:text-emerald-300">
              Uploaded! Processing will begin shortly.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg border border-black/10 dark:border-white/10 text-sm font-medium text-foreground/60 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={
              !file || uploadState === "uploading" || uploadState === "success"
            }
            className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all flex items-center gap-2"
          >
            {uploadState === "uploading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : uploadState === "success" ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Done
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
