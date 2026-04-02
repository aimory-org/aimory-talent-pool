interface ManualUploadCardProps {
  onManualUpload: () => void;
}

export function TotalCardWithAction({ onManualUpload }: ManualUploadCardProps) {
  return (
    <button
      type="button"
      onClick={onManualUpload}
      className="w-full group relative bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 backdrop-blur-lg rounded-xl p-3 min-h-[100px] border border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20 transition-all duration-300 text-left"
    >
      <div className="flex flex-col items-center justify-center gap-1">
        <span className="text-sm font-medium text-foreground/60 uppercase tracking-wider">
          Manual Upload
        </span>
        <span className="text-3xl md:text-3xl font-bold text-foreground">
          Upload Resume
        </span>
      </div>
    </button>
  );
}
