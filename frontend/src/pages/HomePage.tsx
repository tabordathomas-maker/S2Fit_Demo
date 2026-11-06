import { Link } from "react-router-dom";

import hero from "../assets/hero-mono-negro.jpg";
import { LinkButton, buttonClasses } from "../components/ui";
import { catalogApi } from "../features/catalog/api";
import { ProductImage } from "../features/catalog/ProductImage";
import { formatCOP } from "../services/format";
import { useAsync } from "../services/useAsync";

const PILLARS = [
  { n: "01", t: "Tienda", d: "Conjuntos, leggings, tops y shorts seamless que se adaptan a tu cuerpo y a tu movimiento.", cta: "Comprar", to: "/tienda" },
  { n: "02", t: "Mi Ruta", d: "Rutinas, recetas y contenido de crecimiento personal con el código de tu compra, más tu panel de hábitos con descuentos.", cta: "Entrar", to: "/mi-ruta" },
  { n: "03", t: "S2 Box", d: "Una caja sorpresa cada mes con tu prenda S2, suplementación y mucho más.", cta: "Descubrir", to: "/s2-box" },
];

function FeaturedProducts() {
  const products = useAsync(() => catalogApi.products(), []);
  const all = products.data ?? [];
  const inStock = all.filter((p) => p.in_stock);
  // Solo prendas con existencias; si todo está agotado se muestran las más recientes (la sección nunca queda vacía).
  const featured = inStock.length > 0 ? inStock.slice(0, 3) : [...all].sort((a, b) => b.id - a.id).slice(0, 3);
  if (featured.length === 0) return null;
  return (
    <section className="pb-[72px]">
      <div className="wrap flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-[clamp(28px,4vw,40px)]">Para moverte hoy</h2>
          <Link to="/tienda" className="inline-flex min-h-11 items-center font-bold text-burgundy">Ver toda la tienda →</Link>
        </div>
        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
          {featured.map((p) => (
            <Link key={p.id} to={`/tienda/${p.slug}`} className="overflow-hidden rounded-3xl bg-white">
              <ProductImage src={p.image_url} alt={p.name} className="w-full" />
              <div className="flex flex-col gap-1 p-5">
                {!p.in_stock && <span className="w-fit rounded-full bg-neutral-200 px-3 py-1 text-sm font-bold text-neutral-800">Agotado</span>}
                <span className="font-display text-lg">{p.name}</span>
                <span className="font-bold text-burgundy">{formatCOP(p.base_price)}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HomePage() {
  return (
    <>
      <section className="py-[72px] pt-14">
        <div className="wrap grid items-center gap-12 md:grid-cols-2">
          <div className="flex flex-col items-start gap-[22px]">
            <span className="rounded-full bg-beige px-4 py-2 text-sm font-bold text-burgundy">
              MODA DEPORTIVA + ESTILO DE VIDA + EXPERIENCIA DIGITAL
            </span>
            <h1 className="text-[clamp(38px,5.4vw,60px)] leading-[1.08]">Ropa para moverte, hábitos para crecer</h1>
            <p className="muted max-w-[520px] text-[19px]">
              Una comunidad para construir la vida que quieres. Tu outfit es el comienzo; nosotras te acompañamos a seguir, a tu propio ritmo.
            </p>
            <div className="flex flex-wrap gap-3">
              <LinkButton to="/tienda" variant="dark">Ver la tienda</LinkButton>
              <LinkButton to="/mi-ruta">Entrar a Mi Ruta</LinkButton>
            </div>
          </div>
          <img src={hero} alt="Mono negro S2 Fit" className="h-[420px] w-full rounded-[32px] object-cover object-top md:h-[540px]" />
        </div>
      </section>

      <section className="pb-[72px]">
        <div className="wrap grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr))]">
          {PILLARS.map((p) => (
            <div key={p.n} className="card flex flex-col items-start gap-3">
              <span className="font-display text-4xl text-burgundy">{p.n}</span>
              <h2 className="text-[22px]">{p.t}</h2>
              <p className="muted">{p.d}</p>
              <LinkButton to={p.to}>{p.cta}</LinkButton>
            </div>
          ))}
        </div>
      </section>

      <FeaturedProducts />

      <section className="bg-burgundy py-[72px] text-cream">
        <div className="wrap flex max-w-[760px] flex-col items-start gap-4">
          <h2 className="text-[clamp(28px,4vw,40px)]">Cada prenda trae un QR</h2>
          <p className="text-lg leading-relaxed text-beige">
            Al comprar recibes un código o un QR: escanéalo y entra a rutinas, recetas y contenido de crecimiento personal. Sin gym perfecto ni disciplina imposible: avanzas a tu ritmo.
          </p>
          <Link to="/mi-ruta" className={buttonClasses("light")}>¿Tienes un código?</Link>
        </div>
      </section>
    </>
  );
}
