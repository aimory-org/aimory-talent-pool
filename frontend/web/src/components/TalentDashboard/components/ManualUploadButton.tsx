import { Button } from "@/components/ui/button";

interface ManualUploadButtonProps {
  onManualUpload: () => void;
}

export function ManualUploadButton({
  onManualUpload,
}: ManualUploadButtonProps) {
  return (
    <Button variant="secondary" size="sm" onClick={onManualUpload}>
      Upload Resume
    </Button>
  );
}
