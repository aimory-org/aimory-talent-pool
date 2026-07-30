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
 *
 * Both viewers auto-zoom so the page fills the available width (PDF via the
 * viewer's own `view=FitH` open parameter, DOCX via a manually computed
 * CSS `zoom`, since docx-preview renders pages at a fixed pixel width). DOCX
 * also gets a download button (top-right) that re-fetches the same blob to
 * save locally, since `<a download>` is ignored for cross-origin (S3) URLs —
 * PDFs already have a download control built into the native viewer.
 */
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
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
// docx-preview hardcodes its wrapper's CSS to `padding: 30px` on every side
// but bottom; needed to back-calculate a fill-width zoom factor from the
// page's own fixed pixel width.
const DOCX_WRAPPER_PADDING = 30;
// Fill 90% of the available width rather than edge-to-edge — a slight zoom
// out so the page doesn't feel cramped against the panel edges.
const FILL_RATIO = 0.9;

export function DocumentViewer({ url, fileKey, title }: DocumentViewerProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageWidthRef = useRef<number | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(isDocx(fileKey));

  useEffect(() => {
    if (!isDocx(fileKey)) return;

    let cancelled = false;
    setLoading(true);
    setError(false);
    pageWidthRef.current = null;

    const updateZoom = () => {
      const wrapper = containerRef.current?.querySelector<HTMLElement>(
        ".docx-preview-wrapper",
      );
      const outerWidth = outerRef.current?.clientWidth;
      const pageWidth = pageWidthRef.current;
      if (!wrapper || !outerWidth || !pageWidth) return;
      const zoom = (outerWidth * FILL_RATIO) / (pageWidth + DOCX_WRAPPER_PADDING * 2);
      wrapper.style.zoom = String(zoom);
    };

    const resizeObserver = new ResizeObserver(updateZoom);
    if (outerRef.current) resizeObserver.observe(outerRef.current);

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
        if (wrapper) {
          wrapper.style.background = BACKDROP;
          const page = wrapper.firstElementChild as HTMLElement | null;
          if (page) {
            pageWidthRef.current = page.offsetWidth;
            updateZoom();
          }
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
    };
  }, [url, fileKey]);

  const handleDownload = async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = fileKey.split("/").pop() || title;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Failed to download document:", err);
      alert("Failed to download document. Please try again.");
    }
  };

  const downloadButton = (
    <button
      onClick={handleDownload}
      title="Download"
      className="absolute top-3 right-3 z-10 flex items-center justify-center h-9 w-9 rounded-lg bg-black/40 hover:bg-black/60 text-white backdrop-blur-sm transition-colors"
    >
      <Download className="w-4 h-4" />
    </button>
  );

  if (!isDocx(fileKey)) {
    return (
      <div
        className="w-full h-full overflow-auto flex justify-center p-[30px]"
        style={{ background: BACKDROP }}
      >
        <div
          className="bg-white shrink-0"
          style={{ boxShadow: PAGE_SHADOW, width: `${FILL_RATIO * 100}%` }}
        >
          <iframe
            src={`${url}#view=FitH`}
            className="w-full h-full border-0"
            title={title}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {downloadButton}
      <div
        ref={outerRef}
        className="relative w-full h-full overflow-auto"
        style={{ background: BACKDROP }}
      >
        {/* containerRef stays in normal layout flow (never display:none) even
            while loading/error overlays cover it, since its rendered page
            width has to be measurable to compute the fill-width zoom. */}
        <div ref={containerRef} />
        {loading && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center text-white text-sm"
            style={{ background: BACKDROP }}
          >
            Loading document...
          </div>
        )}
        {error && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center text-white text-sm"
            style={{ background: BACKDROP }}
          >
            Could not preview this document.
          </div>
        )}
      </div>
    </div>
  );
}
