import { useState } from "react";

import { FileUploadButton, IMAGE_ACCEPT } from "../../components/FileUploadButton";
import { Alert, Badge, Button, Field, Spinner } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { useAsync } from "../../services/useAsync";
import { s2boxAdminApi, type AdminBoxImage } from "../s2box/api";

/** Sección «Galería de la caja» del panel S2 Box: subir, ordenar, activar y eliminar imágenes. */
export function BoxGalleryAdmin() {
  const images = useAsync(() => s2boxAdminApi.list(), []);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = images.data ?? [];

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await images.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    await run(async () => {
      const { url } = await s2boxAdminApi.upload(file);
      const next = list.length ? Math.max(...list.map((i) => i.sort_order)) + 1 : 0;
      await s2boxAdminApi.create({ url, sort_order: next });
    });
    setUploading(false);
  };

  // Intercambia el orden con la imagen vecina; si empatan se renumera toda la lista para que quede estable.
  const move = (index: number, delta: -1 | 1) => {
    const other = index + delta;
    if (other < 0 || other >= list.length) return;
    const reordered = [...list];
    [reordered[index], reordered[other]] = [reordered[other], reordered[index]];
    void run(async () => {
      for (const [position, image] of reordered.entries()) {
        if (image.sort_order !== position) await s2boxAdminApi.update(image.id, { sort_order: position });
      }
    });
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Galería de la caja">
      <h3 className="text-2xl">Galería de la caja</h3>
      <p className="muted text-sm">Estas imágenes se ven en la página S2 Box, en el orden de esta lista.</p>
      <FileUploadButton
        id="box-image-file"
        label="Subir imagen"
        accept={IMAGE_ACCEPT}
        hint="JPG, PNG o WEBP, máximo 5 MB. Se guarda en la carpeta s2box/."
        busy={uploading}
        onFile={(f) => void upload(f)}
      />
      {error && <Alert>{error}</Alert>}
      {images.error && <Alert>{images.error}</Alert>}
      {images.loading && !images.data && <Spinner />}
      {images.data && list.length === 0 && <p className="muted">Aún no hay imágenes en la galería.</p>}
      <ul className="flex flex-col gap-3">
        {list.map((image, index) => (
          <GalleryRow
            key={image.id}
            image={image}
            isFirst={index === 0}
            isLast={index === list.length - 1}
            onMove={(delta) => move(index, delta)}
            run={run}
          />
        ))}
      </ul>
    </section>
  );
}

function GalleryRow({ image, isFirst, isLast, onMove, run }: {
  image: AdminBoxImage;
  isFirst: boolean;
  isLast: boolean;
  onMove: (delta: -1 | 1) => void;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [alt, setAlt] = useState(image.alt_text ?? "");
  const [confirming, setConfirming] = useState(false);
  const name = image.alt_text || `imagen ${image.id}`;

  return (
    <li className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <img src={image.url} alt={image.alt_text ?? ""} loading="lazy" className="h-24 w-24 shrink-0 rounded-xl object-cover" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <Field label="Texto alternativo" id={`box-alt-${image.id}`} maxLength={200} value={alt} onChange={(e) => setAlt(e.target.value)} />
          </div>
          <Button disabled={alt.trim() === (image.alt_text ?? "")} onClick={() => void run(() => s2boxAdminApi.update(image.id, { alt_text: alt.trim() || null }))}>
            Guardar texto
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Orden: <strong>{image.sort_order}</strong></span>
          <Badge tone={image.is_active ? "green" : "gray"}>{image.is_active ? "Activa" : "Oculta"}</Badge>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 sm:max-w-[260px] sm:justify-end">
        <Button aria-label={`Subir ${name}`} disabled={isFirst} onClick={() => onMove(-1)}>↑ Subir</Button>
        <Button aria-label={`Bajar ${name}`} disabled={isLast} onClick={() => onMove(1)}>↓ Bajar</Button>
        <Button onClick={() => void run(() => s2boxAdminApi.update(image.id, { is_active: !image.is_active }))}>
          {image.is_active ? "Desactivar" : "Activar"}
        </Button>
        {confirming ? (
          <>
            <Button variant="dark" onClick={() => void run(() => s2boxAdminApi.remove(image.id))}>Sí, eliminar</Button>
            <Button onClick={() => setConfirming(false)}>Cancelar</Button>
          </>
        ) : (
          <Button onClick={() => setConfirming(true)}>Eliminar</Button>
        )}
      </div>
    </li>
  );
}
