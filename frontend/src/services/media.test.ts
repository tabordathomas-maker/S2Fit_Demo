import { config } from "../config";
import { prettyWhatsApp } from "../features/admin/SettingsAdmin";
import { classifyMedia } from "./media";
import { applyWhatsAppNumber } from "./settings";

describe("Videos e imágenes de contenido", () => {
  it("incrusta YouTube y Vimeo", () => {
    expect(classifyMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      type: "embed", src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    });
    expect(classifyMedia("https://youtu.be/dQw4w9WgXcQ?t=3").type).toBe("embed");
    expect(classifyMedia("https://vimeo.com/123456")).toEqual({ type: "embed", src: "https://player.vimeo.com/video/123456" });
  });

  it("reproduce archivos subidos y muestra imágenes", () => {
    expect(classifyMedia("https://x.supabase.co/storage/v1/object/public/b/content/videos/a.mp4").type).toBe("video");
    expect(classifyMedia("https://x.supabase.co/storage/v1/object/public/b/content/images/a.webp").type).toBe("image");
  });

  it("deja como enlace lo que no reconoce", () => {
    expect(classifyMedia("https://drive.google.com/file/d/abc/view").type).toBe("link");
  });
});

describe("WhatsApp configurable", () => {
  const original = config.whatsappNumber;
  afterEach(() => { config.whatsappNumber = original; });

  it("aplica el número guardado por el administrador", () => {
    applyWhatsAppNumber("573001234567");
    expect(config.whatsappNumber).toBe("573001234567");
  });

  it("conserva el número de respaldo si la API no trae ninguno", () => {
    config.whatsappNumber = "573110000000";
    applyWhatsAppNumber(null);
    expect(config.whatsappNumber).toBe("573110000000");
  });

  it("muestra el número en formato legible", () => {
    expect(prettyWhatsApp("573001234567")).toBe("+57 300 123 4567");
    expect(prettyWhatsApp("14155550100")).toBe("+14155550100");
  });
});
