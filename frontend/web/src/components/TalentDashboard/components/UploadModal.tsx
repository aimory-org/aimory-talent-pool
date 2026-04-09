import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, FileText} from "lucide-react";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (file: File | null) => void;
}

export function UploadModal({ isOpen, onClose, onUpload }: UploadModalProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
    const validTypes = ["application/pdf", "application/docx"];
    return validTypes.includes(file.type);
  };

  const handleSubmit = () => {
    onUpload(selectedFile);
    onClose();
    setSelectedFile(null);
  };

  const getFileIcon = (file: File) => {
    if (file.type === "application/pdf") {
      return <FileText className="h-8 w-8 text-red-500" />;
    }
    if (file.type === "application/docx") {
      return <FileText className="h-8 w-8 text-green-500" />;
    }
    return <Upload className="h-8 w-8 text-gray-500" />;
  };

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
        <Card className="w-full max-w-md p-6 bg-background border border-border">
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
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20"
                    : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
                }
                ${selectedFile ? "bg-green-50 dark:bg-green-950/20 border-green-500" : ""}
              `}
            >
              {selectedFile ? (
                <div className="space-y-2">
                  {getFileIcon(selectedFile)}
                  <p className="text-sm font-medium text-foreground">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 text-gray-400 mx-auto" />
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

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={!selectedFile}
                className="flex-1"
              >
                Upload Resume
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
