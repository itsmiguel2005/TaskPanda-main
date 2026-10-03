import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function MessagePhoto({
  photo,
  requestHeaders,
  alt = "Message photo",
  imageClassName = "max-h-52 max-w-full rounded-lg object-cover",
}) {
  const [source, setSource] = useState(photo.startsWith("/uploads/") ? photo : "");
  const [loadError, setLoadError] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (photo.startsWith("/uploads/")) {
      setSource(photo);
      setLoadError(false);
      return undefined;
    }

    const controller = new AbortController();
    let objectUrl = "";
    setSource("");
    setLoadError(false);
    fetch(photo, { headers: requestHeaders, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || "Could not load this photo.");
        }
        return response.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSource(objectUrl);
      })
      .catch((error) => {
        if (error.name !== "AbortError") setLoadError(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo, requestHeaders]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocusedElement = document.activeElement;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setIsOpen(false);
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocusedElement?.focus?.();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (loadError) return <span className="inline-flex h-16 items-center rounded-md bg-white/10 px-3 text-xs">Photo unavailable</span>;
  if (!source) return <span className="inline-flex h-16 w-16 animate-pulse rounded-md bg-slate-200/70" aria-label="Loading photo" />;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={`View ${alt.toLowerCase()} full size`}
        className="dashboard-focus max-w-full cursor-zoom-in rounded-lg"
      >
        <img src={source} alt={alt} loading="lazy" className={imageClassName} />
      </button>
      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[120] flex overflow-y-auto bg-slate-950/90 p-4 sm:p-8"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <section role="dialog" aria-modal="true" aria-label={alt} className="relative m-auto flex max-w-full shrink-0 flex-col items-center">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setIsOpen(false)}
              className="dashboard-focus mb-3 min-h-10 rounded-xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Close photo
            </button>
            <img src={source} alt={alt} className="max-h-[calc(100dvh-8rem)] max-w-full rounded-xl object-contain shadow-[0_24px_80px_rgba(0,0,0,0.4)]" />
            <p className="mt-3 text-xs font-medium text-white/75">Click outside or press Esc to close</p>
          </section>
        </div>,
        document.body
      )}
    </>
  );
}
