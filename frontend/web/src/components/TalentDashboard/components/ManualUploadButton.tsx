import { UploadActionButton } from "@/components/ui/upload-action-button";

interface ManualUploadButtonProps {
  onManualUpload: () => void;
}

export function ManualUploadButton({
  onManualUpload,
}: ManualUploadButtonProps) {
  return (
    <UploadActionButton
      label="Upload Resume"
      onClick={onManualUpload}
      className="h-12 rounded-xl px-5 shrink-0"
    />
  );
}
