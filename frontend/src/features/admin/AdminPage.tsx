import { useSearchParams } from "react-router-dom";

import { Alert, Pill, SectionTitle } from "../../components/ui";
import { useAsync } from "../../services/useAsync";
import { adminApi } from "./api";
import { CatalogAdmin } from "./CatalogAdmin";
import { ContentAdmin } from "./ContentAdmin";
import { MembershipsAdmin } from "./MembershipsAdmin";
import { OrdersAdmin } from "./OrdersAdmin";
import { PaymentsAdmin } from "./PaymentsAdmin";
import { RoutinesAdmin } from "./RoutinesAdmin";
import { SettingsAdmin } from "./SettingsAdmin";
import { UsersAdmin } from "./UsersAdmin";

const TABS = [
  { id: "pagos", label: "Pagos", component: PaymentsAdmin },
  { id: "pedidos", label: "Pedidos", component: OrdersAdmin },
  { id: "catalogo", label: "Catálogo e inventario", component: CatalogAdmin },
  { id: "plus", label: "S2 Plus", component: MembershipsAdmin },
  { id: "contenido", label: "Contenido y retos", component: ContentAdmin },
  { id: "rutinas", label: "Rutinas personalizadas", component: RoutinesAdmin },
  { id: "usuarios", label: "Usuarios y auditoría", component: UsersAdmin },
  { id: "configuracion", label: "Configuración", component: SettingsAdmin },
];

export function AdminPage() {
  const [params, setParams] = useSearchParams();
  const current = TABS.find((t) => t.id === params.get("tab")) ?? TABS[0];
  const Current = current.component;
  // Se vuelve a consultar al cambiar de pestaña, para que el aviso desaparezca tras guardar.
  const settings = useAsync(() => adminApi.settings(), [current.id]);
  const missingWhatsApp = settings.data !== undefined && !settings.data.whatsapp_number;

  return (
    <section className="py-12">
      <div className="wrap flex flex-col gap-6">
        <SectionTitle eyebrow="ADMINISTRACIÓN" title="Panel S2 Fit" />
        <nav className="flex flex-wrap gap-2" aria-label="Secciones de administración">
          {TABS.map((t) => (
            <Pill key={t.id} active={t.id === current.id} onClick={() => setParams({ tab: t.id })}>{t.label}</Pill>
          ))}
        </nav>
        {missingWhatsApp && current.id !== "configuracion" && (
          <Alert tone="info">
            La tienda todavía no tiene número de WhatsApp: los clientes no podrán abrir el chat al comprar.{" "}
            <button type="button" className="font-bold text-burgundy underline" onClick={() => setParams({ tab: "configuracion" })}>
              Agregarlo ahora
            </button>
          </Alert>
        )}
        <Current />
      </div>
    </section>
  );
}
