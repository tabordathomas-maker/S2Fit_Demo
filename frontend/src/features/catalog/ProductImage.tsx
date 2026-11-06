import { useState } from "react";

import { resolveImage } from "../../services/format";

export type ProductImageFit = "contain" | "cover" | "blur";

/** Estilo de las fotos de toda la tienda. Cámbialo aquí para que cambie en todas las pantallas. */
export const PRODUCT_IMAGE_FIT: ProductImageFit = "contain";
/** Las fotos de producto son verticales (1080 × 1350 px). */
export const PRODUCT_IMAGE_RATIO = "aspect-[4/5]";

interface ProductImageProps {
  src: string | null;
  alt: string;
  className?: string;
  fit?: ProductImageFit;
  ratio?: string;
}

export function ProductImage({
  src,
  alt,
  className = "",
  fit = PRODUCT_IMAGE_FIT,
  ratio = PRODUCT_IMAGE_RATIO,
}: ProductImageProps) {
  // Se recuerda la URL que falló (no un booleano) para que una foto nueva vuelva a intentarse.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = resolveImage(src);

  if (!url || failedUrl === url) {
    return (
      <div
        className={`flex items-center justify-center bg-beige font-display text-4xl text-burgundy ${ratio} ${className}`}
        role="img"
        aria-label={alt}
      >
        S2
      </div>
    );
  }

  const fitClass = fit === "cover" ? "object-cover" : "object-contain";
  return (
    <div className={`relative overflow-hidden bg-white ${ratio} ${className}`}>
      {fit === "blur" && (
        <img
          src={url}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-xl"
        />
      )}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(url)}
        className={`relative h-full w-full ${fitClass} object-center`}
      />
    </div>
  );
}
