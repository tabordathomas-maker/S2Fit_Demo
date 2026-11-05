import { useEffect, useRef, useState } from "react";

import { Spinner } from "../../components/ui";
import { S2BOX } from "../../content/s2box";
import { useAsync } from "../../services/useAsync";
import { s2boxApi, type BoxImage } from "./api";

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

/** Imagen ampliada: se cierra con Esc o con el botón, y el foco no sale del cuadro mientras está abierto. */
export function ImageLightbox({ image, onClose }: { image: BoxImage; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Tab") {
        const items = dialog.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (!items || items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
      onClick={onClose}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={image.alt_text || "Imagen de S2 Box"}
        className="relative flex max-h-full max-w-4xl flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          className="self-end rounded-full bg-cream px-5 py-2 font-bold text-burgundy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Cerrar
        </button>
        <img src={image.url} alt={image.alt_text ?? ""} className="max-h-[80vh] max-w-full rounded-2xl object-contain" />
        {image.alt_text && <p className="text-center text-cream">{image.alt_text}</p>}
      </div>
    </div>
  );
}

/** Galería de la caja: grilla de miniaturas; al pulsar una se abre en grande. */
export function BoxGallery() {
  const images = useAsync(() => s2boxApi.images(), []);
  const [selected, setSelected] = useState<BoxImage | null>(null);
  const list = images.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-[clamp(26px,3.5vw,36px)] text-burgundy">{S2BOX.galleryTitle}</h2>
      {images.loading && <Spinner />}
      {/* Si la galería no carga se muestra el mismo mensaje vacío: no es un error para quien visita. */}
      {!images.loading && list.length === 0 && (
        <div className="flex min-h-[200px] items-center justify-center rounded-3xl border-2 border-dashed border-beige bg-cream p-8 text-center">
          <p className="font-display text-xl text-burgundy">{S2BOX.galleryEmpty}</p>
        </div>
      )}
      {list.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {list.map((image) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setSelected(image)}
                aria-label={`Ampliar imagen${image.alt_text ? `: ${image.alt_text}` : ""}`}
                className="block aspect-square w-full overflow-hidden rounded-2xl bg-beige focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-burgundy"
              >
                <img
                  src={image.url}
                  alt={image.alt_text ?? ""}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform hover:scale-105"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && <ImageLightbox image={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
