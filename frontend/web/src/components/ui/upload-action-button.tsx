import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UploadActionButtonProps
  extends Omit<React.ComponentProps<typeof Button>, "children"> {
  label: string;
}

export function UploadActionButton({
  label,
  className,
  ...props
}: UploadActionButtonProps) {
  return (
    <Button
      type="button"
      className={cn(
        "h-9 px-3 rounded-lg bg-primary hover:bg-primary-hover text-primary-foreground text-sm font-medium transition-all",
        className,
      )}
      {...props}
    >
      <Upload className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}