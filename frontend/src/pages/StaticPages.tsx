import { LinkButton, SectionTitle } from "../components/ui";

export function PrivacyPage() {
  return (
    <section className="py-[72px]">
      <div className="wrap flex max-w-3xl flex-col gap-5">
        <SectionTitle title="Tratamiento de datos personales" />
        <p className="muted">
          Texto base para revisión legal (Ley 1581 de 2012, Colombia). Ajústalo con la razón social, NIT y canal de contacto oficiales antes de publicar.
        </p>
        <h2 className="text-xl">Qué datos recogemos</h2>
        <p>Nombre, correo, celular, pedidos, solicitudes de suscripción, estado de pagos y el registro de hábitos y retos que decidas guardar.</p>
        <h2 className="text-xl">Para qué los usamos</h2>
        <p>Gestionar tu cuenta, tus compras y tu membresía, contactarte por WhatsApp sobre tus pedidos y mostrarte tu progreso. No vendemos tus datos.</p>
        <h2 className="text-xl">Pagos</h2>
        <p>No almacenamos datos bancarios ni de tarjetas. Los pagos se acuerdan y verifican por fuera de la web mediante el convenio de pago.</p>
        <h2 className="text-xl">Tus derechos</h2>
        <p>Puedes conocer, actualizar, rectificar o solicitar la eliminación de tus datos escribiéndonos por WhatsApp o al correo oficial de la marca.</p>
      </div>
    </section>
  );
}

export function NotFoundPage() {
  return (
    <section className="py-[72px]">
      <div className="wrap flex flex-col items-start gap-4">
        <SectionTitle title="Página no encontrada">La dirección que buscas no existe.</SectionTitle>
        <LinkButton to="/" variant="dark">Volver al inicio</LinkButton>
      </div>
    </section>
  );
}
