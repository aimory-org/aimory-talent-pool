import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const DOUBLE_CONFIRM_THRESHOLD = 10;

export function ConfirmDialog({ isOpen, count, onConfirm, onCancel }: ConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState("");

  if (!isOpen) return null;

  const needsDoubleConfirm = count > DOUBLE_CONFIRM_THRESHOLD;
  const canConfirm = !needsDoubleConfirm || confirmText.toLowerCase() === "delete";

  const handleConfirm = () => {
    if (!canConfirm) return;
    setConfirmText("");
    onConfirm();
  };

  const handleCancel = () => {
    setConfirmText("");
    onCancel();
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={handleCancel}
      />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md mx-auto px-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-black/10 dark:border-white/10 shadow-2xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                Delete {count} {count === 1 ? "candidate" : "candidates"}?
              </h2>
            </div>
            <button
              onClick={handleCancel}
              className="text-foreground/40 hover:text-foreground transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <p className="text-sm text-foreground/60 mb-4">
            This will permanently delete {count}{" "}
            {count === 1 ? "candidate" : "candidates"} and{" "}
            {count === 1 ? "their resume" : "their resumes"} from storage. This
            cannot be undone.
          </p>

          {needsDoubleConfirm && (
            <div className="mb-4">
              <p className="text-sm text-foreground/70 mb-2">
                Type <span className="font-mono font-bold text-red-500">delete</span> to confirm:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
                placeholder="delete"
                autoFocus
                className="w-full h-10 px-3 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500/50"
              />
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-foreground/70 hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-all text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-red-500/25"
            >
              Delete {count} {count === 1 ? "candidate" : "candidates"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
