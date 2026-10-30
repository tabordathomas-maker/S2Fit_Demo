import { useState, type FormEvent } from "react";

import { Alert, Badge, Button, Field, Select, Spinner, TextArea } from "../../components/ui";
import { errorMessage } from "../../services/api";
import { formatCOP } from "../../services/format";
import type { Category } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { ProductImage } from "../catalog/ProductImage";
import { adminApi, type AdminProduct, type AdminVariant } from "./api";

function slugify(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function CatalogAdmin() {
  const products = useAsync(() => adminApi.products(), []);
  const categories = useAsync(() => adminApi.categories(), []);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await Promise.all([products.reload(), categories.reload()]);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-6 lg:grid-cols-2">
        <NewCategoryForm onCreate={(body) => run(() => adminApi.createCategory(body))} />
        <NewProductForm categories={categories.data ?? []} onCreate={(body) => run(() => adminApi.createProduct(body))} />
      </div>
      {products.loading && <Spinner />}
      {products.error && <Alert>{products.error}</Alert>}
      <ul className="flex flex-col gap-4">
        {products.data?.map((p) => <ProductEditor key={p.id} product={p} categories={categories.data ?? []} run={run} />)}
      </ul>
    </div>
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

function NewProductForm({ categories, onCreate }: { categories: Category[]; onCreate: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [form, setForm] = useState({ name: "", category_id: "", base_price: "", description: "" });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await onCreate({
      name: form.name.trim(),
      slug: slugify(form.name),
      category_id: Number(form.category_id),
      base_price: Number(form.base_price),
      description: form.description.trim() || null,
    });
    if (ok) setForm({ name: "", category_id: "", base_price: "", description: "" });
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
      <Button type="submit" variant="dark" className="self-start">Crear producto</Button>
    </form>
  );
}

function ProductEditor({ product, categories, run }: { product: AdminProduct; categories: Category[]; run: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: product.name,
    base_price: String(product.base_price),
    image_url: product.image_url ?? "",
    description: product.description ?? "",
    category_id: String(product.category_id),
  });

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(() =>
      adminApi.updateProduct(product.id, {
        name: form.name.trim(),
        base_price: Number(form.base_price),
        image_url: form.image_url.trim() || null,
        description: form.description.trim() || null,
        category_id: Number(form.category_id),
      }),
    );
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    await run(async () => {
      const { url } = await adminApi.uploadImage(file);
      setForm((f) => ({ ...f, image_url: url }));
      await adminApi.updateProduct(product.id, { image_url: url });
    });
  };

  return (
    <li className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <ProductImage src={product.image_url} alt={product.name} className="h-20 w-16 rounded-xl" />
        <div className="flex-1">
          <p className="font-display text-lg">{product.name}</p>
          <p className="text-sm text-muted">{formatCOP(product.base_price)} · {product.variants.length} variantes</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {product.is_demo && <Badge tone="gray">Demo</Badge>}
          <Badge tone={product.is_active ? "green" : "red"}>{product.is_active ? "Activo" : "Inactivo"}</Badge>
        </div>
        <Button onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Cerrar" : "Editar"}</Button>
        <Button onClick={() => void run(() => adminApi.updateProduct(product.id, { is_active: !product.is_active }))}>
          {product.is_active ? "Desactivar" : "Activar"}
        </Button>
      </div>
      {open && (
        <div className="flex flex-col gap-4 border-t border-beige pt-4">
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre" id={`n-${product.id}`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Field label="Precio base (COP)" id={`p-${product.id}`} type="number" min={0} value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} />
            <Select label="Categoría" id={`c-${product.id}`} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Field label="Imagen (URL o ruta)" id={`i-${product.id}`} value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
            <div className="sm:col-span-2"><TextArea label="Descripción" id={`d-${product.id}`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div>
              <label htmlFor={`u-${product.id}`} className="label">Subir foto (JPG, PNG o WEBP, máx. 5 MB)</label>
              <input id={`u-${product.id}`} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void upload(e.target.files?.[0])} />
            </div>
            <Button type="submit" variant="dark" className="self-end">Guardar producto</Button>
          </form>
          <h4 className="font-display text-lg">Variantes e inventario</h4>
          <ul className="flex flex-col gap-2">
            {product.variants.map((v) => <VariantRow key={v.id} variant={v} run={run} />)}
          </ul>
          <NewVariantForm productSlug={product.slug} onCreate={(body) => run(() => adminApi.createVariant(product.id, body))} />
        </div>
      )}
    </li>
  );
}

function VariantRow({ variant: v, run }: { variant: AdminVariant; run: (fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const adjust = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => adminApi.adjustStock(v.id, Number(delta), note.trim()))) {
      setDelta("");
      setNote("");
    }
  };
  return (
    <li className="flex flex-col gap-2 rounded-2xl bg-cream p-3 lg:flex-row lg:items-center">
      <div className="flex-1 text-sm">
        <strong>{v.sku}</strong> · Talla {v.size} · {v.color} · {formatCOP(v.unit_price)}
        <br />
        Existencias: {v.stock_on_hand} · Reservadas: {v.stock_reserved} · Disponibles: {v.available}
        {!v.is_active && <strong className="text-red-700"> · Inactiva</strong>}
      </div>
      <form onSubmit={adjust} className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`delta-${v.id}`}>Cambio de existencias</label>
        <input id={`delta-${v.id}`} type="number" required placeholder="+5 / -1" className="input w-24" value={delta} onChange={(e) => setDelta(e.target.value)} />
        <label className="sr-only" htmlFor={`note-${v.id}`}>Motivo</label>
        <input id={`note-${v.id}`} required minLength={3} placeholder="Motivo" className="input w-40" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit">Ajustar</Button>
        <Button onClick={() => void run(() => adminApi.updateVariant(v.id, { is_active: !v.is_active }))}>{v.is_active ? "Desactivar" : "Activar"}</Button>
      </form>
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
