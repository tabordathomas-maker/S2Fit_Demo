import { useSearchParams } from "react-router-dom";

import { Pill, SectionTitle } from "../../components/ui";
import { CatalogAdmin } from "./CatalogAdmin";
import { ContentAdmin } from "./ContentAdmin";
import { MembershipsAdmin } from "./MembershipsAdmin";
import { OrdersAdmin } from "./OrdersAdmin";
import { PaymentsAdmin } from "./PaymentsAdmin";
import { UsersAdmin } from "./UsersAdmin";

const TABS = [
  { id: "pagos", label: "Pagos", component: PaymentsAdmin },
  { id: "pedidos", label: "Pedidos", component: OrdersAdmin },
  { id: "catalogo", label: "Catálogo e inventario", component: CatalogAdmin },
  { id: "plus", label: "S2 Plus", component: MembershipsAdmin },
  { id: "contenido", label: "Contenido y retos", component: ContentAdmin },
  { id: "usuarios", label: "Usuarios y auditoría", component: UsersAdmin },
];

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const current = TABS.find((t) => t.id === params.get("tab")) ?? TABS[0];
  const Current = current.component;

  return (
    <section className="py-12">
      <div className="wrap flex flex-col gap-6">
        <SectionTitle eyebrow="ADMINISTRACIÓN" title="Panel S2 Fit" />
        <nav className="flex flex-wrap gap-2" aria-label="Secciones de administración">
          {TABS.map((t) => (
            <Pill key={t.id} active={t.id === current.id} onClick={() => setParams({ tab: t.id })}>{t.label}</Pill>
          ))}
        </nav>
        <Current />
      </div>
    </section>
  );
}
