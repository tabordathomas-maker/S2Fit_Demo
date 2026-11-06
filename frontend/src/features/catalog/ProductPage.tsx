import { QRCodeSVG } from "qrcode.react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Alert, Badge, Button, LinkButton, Pill, Spinner } from "../../components/ui";
import { config } from "../../config";
import { formatCOP } from "../../services/format";
import { formatSize } from "../../services/sizes";
import type { ProductDetail } from "../../services/types";
import { useAsync } from "../../services/useAsync";
import { MAX_PER_VARIANT, useCart } from "../cart/CartProvider";
import { catalogApi } from "./api";
import { ProductImage } from "./ProductImage";

export function ProductPage() {
  const { slug = "" } = useParams();
  const product = useAsync(() => catalogApi.product(slug), [slug]);

  return (
    <section className="py-12">
      <div className="wrap">
        <Link to="/tienda" className="inline-flex min-h-11 items-center font-bold text-burgundy">← Volver a la tienda</Link>
        {product.loading && <Spinner />}
        {product.error && <div className="mt-6"><Alert>{product.error}</Alert></div>}
        {product.data && <ProductView product={product.data} />}
      </div>
    </section>
  );
}

function ProductView({ product }: { product: ProductDetail }) {
  const { add } = useCart();
  const colors = useMemo(() => [...new Set(product.variants.map((v) => v.color))], [product]);
  const [color, setColor] = useState(colors[0] ?? "");
  const [size, setSize] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  const sizesForColor = product.variants.filter((v) => v.color === color);
  const variant = sizesForColor.find((v) => v.size === size);
  const maxQuantity = Math.min(variant?.available ?? 0, MAX_PER_VARIANT);

  const addToCart = () => {
    if (!variant) return;
    add({
      variantId: variant.id,
      productSlug: product.slug,
      productName: product.name,
      variantLabel: `Talla ${formatSize(variant.size)} · ${variant.color}`,
      imageUrl: product.image_url,
      displayPrice: variant.unit_price,
      quantity,
      maxQuantity: variant.available,
    });
    setAdded(true);
  };

  return (
    <div className="mt-6 grid items-start gap-10 md:grid-cols-2">
      <ProductImage src={product.image_url} alt={product.name} className="w-full rounded-[32px] md:mx-auto md:max-w-[512px]" />
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          <Badge>{product.category.name}</Badge>
          {product.is_demo && <Badge tone="gray">Datos de demostración</Badge>}
        </div>
        <h1 className="text-[clamp(30px,4vw,44px)] leading-tight">{product.name}</h1>
        <p className="muted text-lg">{product.description}</p>
        <span className="text-2xl font-bold text-burgundy">{formatCOP(variant?.unit_price ?? product.base_price)}</span>

        <aside className="flex items-center gap-4 rounded-2xl bg-cream p-4" aria-label="Incluye QR a Mi Ruta">
          <QRCodeSVG
            value={`${window.location.origin}${config.baseUrl}#/mi-ruta`}
            size={72}
            role="img"
            aria-label="QR de ejemplo a Mi Ruta"
            className="shrink-0"
          />
          <div className="flex flex-col gap-1 text-sm">
            <h2 className="font-display text-lg text-burgundy">Incluye QR a Mi Ruta</h2>
            <p>Al comprar recibes un código o QR para entrar a Mi Ruta.</p>
            <Link to="/mi-ruta" className="inline-flex min-h-11 items-center font-bold text-burgundy underline">¿Tienes un código?</Link>
          </div>
        </aside>

        {product.variants.length === 0 && <p className="font-bold text-burgundy">Consultar disponibilidad</p>}

        <fieldset hidden={product.variants.length === 0}>
          <legend className="label">Color</legend>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <Pill key={c} active={c === color} onClick={() => { setColor(c); setSize(""); setAdded(false); }}>{c}</Pill>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">Talla</legend>
          <div className="flex flex-wrap gap-2">
            {sizesForColor.map((v) => (
              <Pill
                key={v.id}
                active={v.size === size}
                disabled={v.available === 0}
                className="disabled:opacity-40"
                onClick={() => { setSize(v.size); setQuantity(1); setAdded(false); }}
              >
                {formatSize(v.size)}{v.available === 0 ? " (agotada)" : ""}
              </Pill>
            ))}
          </div>
        </fieldset>

        {variant && (
          <p className="text-sm text-muted">
            {variant.available > 0 ? `${variant.available} disponibles` : "Sin existencias"} · SKU {variant.sku}
          </p>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="quantity" className="label">Cantidad</label>
            <input
              id="quantity"
              type="number"
              min={1}
              max={Math.max(1, maxQuantity)}
              value={quantity}
              disabled={!variant || maxQuantity === 0}
              onChange={(e) => setQuantity(Math.max(1, Math.min(Number(e.target.value) || 1, maxQuantity || 1)))}
              className="input w-28"
            />
          </div>
          <Button variant="dark" disabled={!variant || maxQuantity === 0} onClick={addToCart}>
            Agregar a la bolsa
          </Button>
        </div>
        {!variant && product.variants.length > 0 && <p className="text-sm text-muted">Elige color y talla para continuar.</p>}
        {added && (
          <Alert tone="success">
            Agregado a tu bolsa. <LinkButton to="/carrito" variant="dark" className="ml-2 mt-2 sm:mt-0">Ver bolsa</LinkButton>
          </Alert>
        )}
      </div>
    </div>
  );
}
