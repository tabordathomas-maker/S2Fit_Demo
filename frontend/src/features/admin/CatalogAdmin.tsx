import { useEffect, useState, type FormEvent } from "react";

import { FileUploadButton, IMAGE_ACCEPT, IMAGE_HINT } from "../../components/FileUploadButton";
import { DeleteDialog } from "../../components/admin/DeleteDialog";
import { diffPatch } from "../../components/admin/patch";
import { RowActions } from "../../components/admin/RowActions";
import type { Usage } from "../../components/admin/usage";
import { ShowArchivedToggle } from "../../components/admin/ShowArchivedToggle";
import { Alert, Badge, Button, Field, Select, Spinner, TextArea } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { formatCOP } from "../../services/format";
import type { Category } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { ProductImage } from "../catalog/ProductImage";
import { adminApi, type AdminProduct, type AdminVariant } from "./api";

const PHOTO_ADVICE = "Recomendado: foto vertical 4:5 (1080 × 1350 px), producto centrado.";

function slugify(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type Run = (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;
type Ask = (target: DeleteTarget) => void;
interface DeleteTarget {
  kind: "product" | "variant" | "category";
  id: number;
  name: string;
  usage?: Usage;
}

const DELETE_NOUN = { product: "producto", variant: "variante", category: "categoría" } as const;

export function CatalogAdmin() {
  const [showArchived, setShowArchived] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const products = useAsync(() => adminApi.products(showArchived, showDeleted), [showArchived, showDeleted]);
  const categories = useAsync(() => adminApi.categories(showArchived), [showArchived]);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [deleting, setDeleting] = useState<DeleteTarget | null>(null);

  const run: Run = async (fn, success) => {
    setMessage(null);
    try {
      await fn();
      if (success) setMessage({ tone: "success", text: success });
      await Promise.all([products.reload(), categories.reload()]);
      return true;
    } catch (err) {
      setMessage({ tone: "error", text: errorMessage(err) });
      return false;
    }
  };

  const remove = () => {
    const t = deleting!;
    return t.kind === "product" ? adminApi.deleteProduct(t.id) : t.kind === "variant" ? adminApi.deleteVariant(t.id) : adminApi.deleteCategory(t.id);
  };
  const archiveInstead = () => {
    const t = deleting!;
    return t.kind === "product" ? adminApi.archiveProduct(t.id) : t.kind === "variant" ? adminApi.archiveVariant(t.id) : adminApi.archiveCategory(t.id);
  };

  return (
    <div className="flex flex-col gap-6">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <NewCategoryForm onCreate={(body) => run(() => adminApi.createCategory(body), "Categoría creada.")} />
        <NewProductForm categories={categories.data ?? []} run={run} />
      </div>
      <div className="flex flex-wrap gap-x-6">
        <ShowArchivedToggle checked={showArchived} onChange={setShowArchived} />
        <ShowArchivedToggle checked={showDeleted} onChange={setShowDeleted} label="Mostrar eliminados" />
      </div>
      <section aria-label="Categorías" className="flex flex-col gap-3">
        <h3 className="text-xl">Categorías</h3>
        <ul className="flex flex-col gap-2">
          {categories.data?.map((c) => <CategoryRow key={c.id} category={c} run={run} ask={setDeleting} />)}
        </ul>
      </section>
      {products.loading && <Spinner />}
      {products.error && <Alert>{products.error}</Alert>}
      <ul className="flex flex-col gap-4">
        {products.data?.map((p) => <ProductEditor key={p.id} product={p} categories={categories.data ?? []} run={run} ask={setDeleting} />)}
      </ul>
      <DeleteDialog
        target={deleting}
        noun={deleting ? DELETE_NOUN[deleting.kind] : ""}
        remove={remove}
        archive={archiveInstead}
        usage={deleting?.usage}
        onClose={() => setDeleting(null)}
        onDone={(outcome) => {
          setMessage({ tone: "success", text: outcome === "deleted" ? `«${deleting?.name}» eliminado.` : `«${deleting?.name}» archivado.` });
          setDeleting(null);
          void Promise.all([products.reload(), categories.reload()]);
        }}
      />
    </div>
  );
}

function CategoryRow({ category: c, run, ask }: { category: Category; run: Run; ask: Ask }) {
  const [editing, setEditing] = useState(false);
  const initial = { name: c.name, description: c.description ?? "", sort_order: c.sort_order };
  const [form, setForm] = useState(initial);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const changes = diffPatch(initial, { ...form, name: form.name.trim(), description: form.description.trim() });
    if (Object.keys(changes).length === 0) return setEditing(false);
    const body = { ...changes, ...("description" in changes ? { description: changes.description || null } : {}) };
    if (await run(() => adminApi.updateCategory(c.id, body), "Categoría actualizada.")) setEditing(false);
  };
  return (
    <li className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex-1 font-bold">{c.name}</span>
        {!c.is_active && <Badge tone="gray">Archivada</Badge>}
        <RowActions
          name={c.name}
          archived={!c.is_active}
          onEdit={() => setEditing((v) => !v)}
          onArchive={() => void run(() => adminApi.archiveCategory(c.id), "Categoría archivada.")}
          onRestore={() => void run(() => adminApi.restoreCategory(c.id), "Categoría restaurada.")}
          onDelete={() => ask({ kind: "category", id: c.id, name: c.name })}
        />
      </div>
      {editing && (
        <form onSubmit={save} aria-label={`Editar categoría ${c.name}`} className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Nombre de la categoría" id={`cat-n-${c.id}`} required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Field label="Descripción de la categoría" id={`cat-d-${c.id}`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Field label="Orden" id={`cat-o-${c.id}`} type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
          <Button type="submit" variant="dark" className="self-start">Guardar categoría</Button>
        </form>
      )}
    </li>
  );
}

function NewCategoryForm({ onCreate }: { onCreate: (body: { name: string; slug: string }) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await onCreate({ name: name.trim(), slug: slugify(name) })) setName("");
  };
  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <h3 className="text-xl">Nueva categoría</h3>
      <Field label="Nombre" id="cat-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit" variant="dark" className="self-start">Crear categoría</Button>
    </form>
  );
}

function NewProductForm({ categories, run }: { categories: Category[]; run: Run }) {
  const [form, setForm] = useState({ name: "", category_id: "", base_price: "", description: "" });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    const ok = await run(async () => {
      const created = await adminApi.createProduct({
        name: form.name.trim(),
        slug: slugify(form.name),
        category_id: Number(form.category_id),
        base_price: Number(form.base_price),
        description: form.description.trim() || null,
      });
      if (photo) {
        const { url } = await adminApi.uploadImage(photo);
        await adminApi.updateProduct(created.id, { image_url: url });
      }
    });
    setCreating(false);
    if (ok) {
      setForm({ name: "", category_id: "", base_price: "", description: "" });
      setPhoto(null);
    }
  };
  return (
    <form onSubmit={submit} className="card flex flex-col gap-3">
      <h3 className="text-xl">Nuevo producto</h3>
      <Field label="Nombre" id="prod-name" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Select label="Categoría" id="prod-cat" required value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
        <option value="">Elige…</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Field label="Precio base (COP)" id="prod-price" type="number" min={0} required value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} />
      <TextArea label="Descripción" id="prod-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="flex flex-wrap items-center gap-4">
        {preview && <ProductImage src={preview} alt="Vista previa de la foto" className="w-24 rounded-xl" />}
        <FileUploadButton id="prod-photo" label={photo ? "Cambiar foto" : "Elegir foto"} accept={IMAGE_ACCEPT} hint={IMAGE_HINT} onFile={setPhoto} />
        <p className="basis-full text-sm text-muted">{PHOTO_ADVICE}</p>
      </div>
      <Button type="submit" variant="dark" className="self-start" disabled={creating}>{creating ? "Creando…" : "Crear producto"}</Button>
    </form>
  );
}

function ProductEditor({ product, categories, run, ask }: { product: AdminProduct; categories: Category[]; run: Run; ask: Ask }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: product.name,
    base_price: String(product.base_price),
    image_url: product.image_url ?? "",
    description: product.description ?? "",
    category_id: String(product.category_id),
  });

  const initial = {
    name: product.name,
    base_price: product.base_price,
    image_url: product.image_url,
    description: product.description,
    category_id: product.category_id,
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    // Solo se envía lo que cambió.
    const changes = diffPatch(initial, {
      name: form.name.trim(),
      base_price: Number(form.base_price),
      image_url: form.image_url.trim() || null,
      description: form.description.trim() || null,
      category_id: Number(form.category_id),
    });
    if (Object.keys(changes).length === 0) return;
    void run(() => adminApi.updateProduct(product.id, changes), "Producto actualizado.");
  };

  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    setSaved(false);
    const ok = await run(async () => {
      const { url } = await adminApi.uploadImage(file);
      setForm((f) => ({ ...f, image_url: url }));
      await adminApi.updateProduct(product.id, { image_url: url });
    });
    setUploading(false);
    setSaved(ok);
  };

  return (
    <li className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <ProductImage src={product.image_url} alt={product.name} className="w-16 rounded-xl" />
        <div className="flex-1">
          <p className="font-display text-lg">{product.name}</p>
          <p className="text-sm text-muted">{formatCOP(product.base_price)} · {product.variants.length} variantes</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {product.is_demo && <Badge tone="gray">Demo</Badge>}
          <Badge tone={product.is_active ? "green" : "gray"}>{product.deleted_at ? "Eliminado" : product.is_active ? "Activo" : "Archivado"}</Badge>
        </div>
        <RowActions
          name={product.name}
          archived={!product.is_active}
          onEdit={() => setOpen((v) => !v)}
          onArchive={() => void run(() => adminApi.archiveProduct(product.id), "Producto archivado: ya no se ve en la tienda.")}
          onRestore={() => void run(() => adminApi.restoreProduct(product.id), "Producto restaurado.")}
          onDelete={() => ask({ kind: "product", id: product.id, name: product.name, usage: product.usage })}
        />
      </div>
      {open && (
        <div className="flex flex-col gap-4 border-t border-beige pt-4">
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" id={`n-${product.id}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Field label="Precio base (COP)" id={`p-${product.id}`} type="number" min={0} value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} />
            <Select label="Categoría" id={`c-${product.id}`} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <div className="flex flex-col gap-2 rounded-2xl bg-cream p-4 sm:col-span-2">
              <h4 className="font-display text-lg">Foto del producto</h4>
              <div className="flex flex-wrap items-center gap-4">
                <ProductImage src={form.image_url || null} alt={form.name} className="w-24 rounded-xl" />
                <FileUploadButton id={`u-${product.id}`} label={form.image_url ? "Cambiar foto" : "Subir foto"} accept={IMAGE_ACCEPT} hint={IMAGE_HINT}
                  busy={uploading} busyLabel="Subiendo foto…" onFile={(f) => void upload(f)} />
                <p className="basis-full text-sm text-muted">{PHOTO_ADVICE}</p>
              </div>
              {saved && <p className="font-bold text-emerald-800" role="status">Foto guardada.</p>}
            </div>
            <div className="sm:col-span-2"><TextArea label="Descripción" id={`d-${product.id}`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <details className="sm:col-span-2">
              <summary className="cursor-pointer font-bold">Usar un enlace a una imagen en vez de subirla</summary>
              <div className="mt-2 flex flex-col gap-1">
                <Field label="Enlace de la imagen (https://…)" id={`i-${product.id}`} value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
                <p className="text-sm text-muted">Si cambias el enlace, pulsa «Guardar producto».</p>
              </div>
            </details>
            <Button type="submit" variant="dark" className="self-end">Guardar producto</Button>
          </form>
          <h4 className="font-display text-lg">Variantes e inventario</h4>
          <ul className="flex flex-col gap-2">
            {product.variants.map((v) => <VariantRow key={v.id} variant={v} run={run} ask={ask} />)}
          </ul>
          <NewVariantForm productSlug={product.slug} onCreate={(body) => run(() => adminApi.createVariant(product.id, body))} />
        </div>
      )}
    </li>
  );
}

function VariantRow({ variant: v, run, ask }: { variant: AdminVariant; run: Run; ask: Ask }) {
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const initial = { size: v.size, color: v.color, price_override: v.price_override };
  const [edit, setEdit] = useState({ size: v.size, color: v.color, price: v.price_override === null ? "" : String(v.price_override) });
  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    const price = edit.price === "" ? null : Number(edit.price);
    const changes = diffPatch(initial, { size: edit.size.trim(), color: edit.color.trim(), price_override: price });
    if (Object.keys(changes).length === 0) return setEditing(false);
    const { price_override, ...rest } = changes;
    const body: Record<string, unknown> = { ...rest };
    if ("price_override" in changes) {
      if (price_override === null) body.clear_price_override = true;
      else body.price_override = price_override;
    }
    if (await run(() => adminApi.updateVariant(v.id, body), "Variante actualizada.")) setEditing(false);
  };
  const adjust = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => adminApi.adjustStock(v.id, Number(delta), note.trim()))) {
      setDelta("");
      setNote("");
    }
  };
  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-cream p-3 lg:flex-row lg:flex-wrap lg:items-center">
      <div className="flex-1 text-sm">
        <strong>{v.sku}</strong> · Talla {v.size} · {v.color} · {formatCOP(v.unit_price)}
        <br />
        Existencias: {v.stock_on_hand} · Reservadas: {v.stock_reserved} · Disponibles: {v.available}
        {!v.is_active && <strong className="text-red-700"> · Archivada</strong>}
      </div>
      <form onSubmit={adjust} className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`delta-${v.id}`}>Cambio de existencias</label>
        <input id={`delta-${v.id}`} type="number" required placeholder="+5 / -1" className="input w-24" value={delta} onChange={(e) => setDelta(e.target.value)} />
        <label className="sr-only" htmlFor={`note-${v.id}`}>Motivo</label>
        <input id={`note-${v.id}`} required minLength={3} placeholder="Motivo" className="input w-40" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit">Ajustar</Button>
      </form>
      <RowActions
        name={`${v.sku}`}
        archived={!v.is_active}
        onEdit={() => setEditing((x) => !x)}
        onArchive={() => void run(() => adminApi.archiveVariant(v.id), "Variante archivada.")}
        onRestore={() => void run(() => adminApi.restoreVariant(v.id), "Variante restaurada.")}
        onDelete={() => ask({ kind: "variant", id: v.id, name: v.sku, usage: v.usage })}
      />
      {editing && (
        <form onSubmit={saveEdit} aria-label={`Editar variante ${v.sku}`} className="grid gap-2 sm:grid-cols-4 sm:items-end">
          <Field label="Talla de la variante" id={`ve-s-${v.id}`} required value={edit.size} onChange={(e) => setEdit({ ...edit, size: e.target.value })} />
          <Field label="Color de la variante" id={`ve-c-${v.id}`} required value={edit.color} onChange={(e) => setEdit({ ...edit, color: e.target.value })} />
          <Field label="Precio especial de la variante" id={`ve-p-${v.id}`} type="number" min={0} placeholder="Opcional" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />
          <Button type="submit" variant="dark">Guardar variante</Button>
        </form>
      )}
    </li>
  );
}

function NewVariantForm({ productSlug, onCreate }: { productSlug: string; onCreate: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [form, setForm] = useState({ size: "", color: "", stock: "0", price: "" });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const sku = `${productSlug}-${form.color}-${form.size}`.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]+/g, "-").slice(0, 60);
    const ok = await onCreate({
      sku,
      size: form.size.trim(),
      color: form.color.trim(),
      initial_stock: Number(form.stock),
      price_override: form.price ? Number(form.price) : null,
    });
    if (ok) setForm({ size: "", color: "", stock: "0", price: "" });
  };
  return (
    <form onSubmit={submit} className="grid gap-2 sm:grid-cols-5 sm:items-end">
      <Field label="Talla" id={`vs-${productSlug}`} required value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
      <Field label="Color" id={`vc-${productSlug}`} required value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
      <Field label="Existencias" id={`vq-${productSlug}`} type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
      <Field label="Precio especial" id={`vp-${productSlug}`} type="number" min={0} placeholder="Opcional" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
      <Button type="submit" variant="dark">Agregar variante</Button>
    </form>
  );
}
