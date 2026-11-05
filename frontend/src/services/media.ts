/** Cómo mostrar un enlace multimedia de Mi Ruta / S2 Box. */
export type MediaKind =
  | { type: "embed"; src: string }
  | { type: "video"; src: string }
  | { type: "image"; src: string }
  | { type: "link"; src: string };

const VIDEO_EXT = /\.(mp4|webm|mov)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

function youTubeId(url: URL): string | null {
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const match = url.pathname.match(/^\/(embed|shorts|live)\/([^/?#]+)/);
    return match ? match[2] : null;
  }
  return null;
}

function vimeoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "");
  if (host === "vimeo.com") return url.pathname.match(/^\/(\d+)/)?.[1] ?? null;
  if (host === "player.vimeo.com") return url.pathname.match(/^\/video\/(\d+)/)?.[1] ?? null;
  return null;
}

/** YouTube y Vimeo se incrustan; MP4/WEBM/MOV se reproducen; imágenes se muestran; lo demás es un enlace. */
export function classifyMedia(raw: string): MediaKind {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { type: "link", src: raw };
  }
  const yt = youTubeId(url);
  if (yt && /^[\w-]{6,20}$/.test(yt)) return { type: "embed", src: `https://www.youtube-nocookie.com/embed/${yt}` };
  const vimeo = vimeoId(url);
  if (vimeo) return { type: "embed", src: `https://player.vimeo.com/video/${vimeo}` };
  if (VIDEO_EXT.test(url.pathname)) return { type: "video", src: raw };
  if (IMAGE_EXT.test(url.pathname)) return { type: "image", src: raw };
  return { type: "link", src: raw };
}
