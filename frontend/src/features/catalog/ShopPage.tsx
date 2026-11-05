import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { Alert, Badge, Button, SectionTitle, Select, Spinner } from "../../components/ui";
import { formatCOP } from "../../services/format";
import { formatSize, sizeOptions } from "../../services/sizes";
import { useAsync } from "../../services/useAsync";
import { catalogApi, type ProductFilters } from "./api";
import { ProductImage } from "./ProductImage";

export function ShopPage() {
  const [filters, setFilters] = useState<ProductFilters>({});
  const [search, setSearch] = useState("");
  const categories = useAsync(() => catalogApi.categories(), []);
  const products = useAsync(() => catalogApi.products(filters), [filters.q, filters.category, filters.size]);
  // Las tallas del filtro salen del catálogo completo, no de una lista fija.
  const everything = useAsync(() => catalogApi.products(), []);
  const sizes = sizeOptions((everything.data ?? []).flatMap((p) => p.sizes));
  // Disponibles primero, agotados al final; dentro de cada grupo se conserva el orden.
  const sorted = [...(products.data ?? [])].sort((a, b) => Number(b.in_stock) - Number(a.in_stock));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFilters((f) => ({ ...f, q: search.trim() || undefined }));
  };

  return (
    <section className="py-[72px]">
      <div className="wrap flex flex-col gap-8">
        <SectionTitle title="Tienda">
          Prendas seamless para entrenar, estudiar, trabajar y salir. Precios en COP.
        </SectionTitle>

        <form onSubmit={submit} className="grid gap-4 rounded-3xl bg-white p-5 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end" role="search">
          <div>
            <label htmlFor="search" className="label">Buscar</label>
            <input id="search" className="input" placeholder="Set, short, mono…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select
            label="Categoría"
            id="category"
            value={filters.category ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value || undefined }))}
          >
            <option value="">Todas</option>
            {categories.data?.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </Select>
          <Select label="Talla" id="size" value={filters.size ?? ""} onChange={(e) => setFilters((f) => ({ ...f, size: e.target.value || undefined }))}>
            <option value="">Todas</option>
            {sizes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <Button type="submit" variant="dark">Buscar</Button>
        </form>

        {products.loading && <Spinner label="Cargando catálogo…" />}
        {products.error && <Alert>{products.error}</Alert>}
        {products.data && products.data.length === 0 && <Alert tone="info">No encontramos prendas con esos filtros.</Alert>}

        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))]">
          {sorted.map((p) => (
            <article key={p.id} className="flex flex-col overflow-hidden rounded-3xl bg-white">
              <Link to={`/tienda/${p.slug}`} aria-label={`Ver ${p.name}`}>
                <ProductImage src={p.image_url} alt={p.name} className="h-[340px] w-full" />
              </Link>
              <div className="flex flex-1 flex-col gap-2 p-[22px]">
                <div className="flex flex-wrap gap-2">
                  {!p.in_stock && <Badge tone="gray">Agotado</Badge>}
                  {p.is_demo && <Badge>Precio de ejemplo</Badge>}
                </div>
                <h2 className="text-xl">{p.name}</h2>
                <p className="muted">{p.description}</p>
                <p className="text-sm text-muted">{p.sizes.length > 0 ? `Tallas: ${p.sizes.map(formatSize).join(", ")}` : "Consultar disponibilidad"}</p>
                <span className="text-xl font-bold text-burgundy">{formatCOP(p.base_price)}</span>
                <Link to={`/tienda/${p.slug}`} className="mt-auto inline-flex min-h-11 items-center justify-center rounded-full border-2 border-ink px-6 font-bold hover:bg-ink hover:text-cream">
                  {p.sizes.length > 0 ? "Elegir talla y color" : "Ver producto"}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
