import { useState } from "react";

import { resolveImage } from "../../services/format";

export function ProductImage({ src, alt, className = "" }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const url = resolveImage(src);
  if (!url || failed) {
    return (
      <div className={`flex items-center justify-center bg-beige font-display text-4xl text-burgundy ${className}`} role="img" aria-label={alt}>
        S2
      </div>
    );
  }
  return <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} className={`object-cover object-top ${className}`} />;
}
