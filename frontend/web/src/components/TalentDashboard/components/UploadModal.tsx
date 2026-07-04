import { useState, useRef } from "react";
import { Upload, FileText, Loader2, CheckCircle2 } from "lucide-react";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<void>;
}

export function UploadModal({ isOpen, onClose, onUpload }: UploadModalProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (isValidFile(file)) {
        setSelectedFile(file);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (isValidFile(file)) {
        setSelectedFile(file);
      }
    }
  };

  const isValidFile = (file: File) => {
    const validTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    return validTypes.includes(file.type);
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;
    setIsUploading(true);
    setError(null);
    try {
      await onUpload(selectedFile);
      setUploadSuccess(true);
      setTimeout(() => {
        onClose();
        setSelectedFile(null);
        setUploadSuccess(false);
      }, 1500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = () => <FileText className="h-8 w-8 text-primary" />;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                Upload Resume
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Drop a PDF or Docx file here, or click to browse
              </p>
            </div>

            {/* File Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                ${
                  isDragOver
                    ? "border-primary bg-accent"
                    : "border-border-strong hover:border-muted-foreground"
                }
                ${selectedFile ? "bg-success/10 border-success" : ""}
              `}
            >
              {selectedFile ? (
                <div className="space-y-2">
                  <div className="flex justify-center">{getFileIcon()}</div>
                  <p className="text-sm font-medium text-foreground truncate px-2">
                    {selectedFile.name}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Click to browse or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF or DocX files only
                  </p>
                </div>
              )}
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf, .docx"
              onChange={handleFileSelect}
              className="hidden"
            />

            {/* Success message */}
            {uploadSuccess && (
              <div className="rounded-lg bg-success/10 border border-success/20 px-3 py-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                <p className="text-sm text-success">
                  Uploaded! Processing will begin shortly.
                </p>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2">
                <p className="text-sm text-destructive">
                  {error}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isUploading}
                className="flex-1 h-9 px-4 rounded-lg border border-border bg-secondary text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!selectedFile || isUploading || uploadSuccess}
                className="flex-1 h-9 px-4 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : uploadSuccess ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Done
                  </>
                ) : (
                  "Upload Resume"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
