/**
 * Renders a resume/document at a given URL. PDFs use the browser's native
 * viewer via iframe. DOCX files can't be rendered natively, so they're
 * fetched and rendered client-side with docx-preview — this keeps the file
 * (and the presigned S3 URL granting access to it) inside our own app
 * instead of proxying it through a third-party viewer.
 *
 * Both cases sit inside the same dark backdrop / white page / drop-shadow
 * frame so switching between a PDF and a DOCX resume doesn't jump between
 * two different-looking viewers. The PDF wrapper below mirrors the padding
 * and shadow docx-preview's own injected `.docx-wrapper` CSS uses, but with
 * the backdrop recolored to match the app's dark theme instead of
 * docx-preview's default flat gray.
 */
import { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";

interface DocumentViewerProps {
  url: string;
  fileKey: string;
  title: string;
}

function isDocx(key: string) {
  const lower = key.toLowerCase();
  return lower.endsWith(".docx") || lower.endsWith(".doc");
}

const PAGE_SHADOW = "0 0 10px rgba(0, 0, 0, 0.5)";
// Matches the app's dark-theme --card token so the viewer canvas fits the
// brand palette instead of docx-preview's default flat gray.
const BACKDROP = "#221a29";

export function DocumentViewer({ url, fileKey, title }: DocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(isDocx(fileKey));

  useEffect(() => {
    if (!isDocx(fileKey)) return;

    let cancelled = false;
    setLoading(true);
    setError(false);

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
        const blob = await res.blob();
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        await renderAsync(blob, containerRef.current, undefined, {
          className: "docx-preview",
        });
        if (cancelled) return;
        // docx-preview hardcodes its wrapper background to "gray"; override
        // it inline so it matches the rest of the frame.
        const wrapper = containerRef.current.querySelector<HTMLElement>(
          ".docx-preview-wrapper",
        );
        if (wrapper) wrapper.style.background = BACKDROP;
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, fileKey]);

  if (!isDocx(fileKey)) {
    return (
      <div
        className="w-full h-full overflow-auto flex justify-center p-[30px]"
        style={{ background: BACKDROP }}
      >
        <div
          className="w-full max-w-[850px] bg-white shrink-0"
          style={{ boxShadow: PAGE_SHADOW }}
        >
          <iframe src={url} className="w-full h-full border-0" title={title} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-auto" style={{ background: BACKDROP }}>
      {loading && (
        <div className="flex items-center justify-center h-full text-white text-sm">
          Loading document...
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center h-full text-white text-sm">
          Could not preview this document.
        </div>
      )}
      <div ref={containerRef} className={loading || error ? "hidden" : undefined} />
    </div>
  );
}
