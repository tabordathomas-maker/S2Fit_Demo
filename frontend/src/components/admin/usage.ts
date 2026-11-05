/** Uso de un plan, producto o variante: lo vigente bloquea el borrado; lo histórico solo se conserva. */
export interface Usage {
  live: Record<string, number>;
  historical: Record<string, number>;
}

const LIVE: Record<string, [string, string]> = {
  subscriptions_active: ["suscripción activa", "suscripciones activas"],
  subscriptions_pending: ["suscripción esperando pago", "suscripciones esperando pago"],
  requests_pending: ["solicitud esperando pago", "solicitudes esperando pago"],
  orders_pending: ["pedido esperando pago con unidades reservadas", "pedidos esperando pago con unidades reservadas"],
};

const HISTORY: Record<string, [string, string]> = {
  subscriptions: ["suscripción anterior", "suscripciones anteriores"],
  requests: ["solicitud anterior", "solicitudes anteriores"],
  renewals: ["renovación anterior", "renovaciones anteriores"],
  orders: ["pedido anterior", "pedidos anteriores"],
};

function describe(counts: Record<string, number>, labels: Record<string, [string, string]>): string {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => `${n} ${(labels[key] ?? [key, key])[n === 1 ? 0 : 1]}`);
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
}

export const liveText = (usage: Usage) => describe(usage.live, LIVE);
export const historyText = (usage: Usage) => describe(usage.historical, HISTORY);
export const isInUse = (usage?: Usage | null) => !!usage && Object.values(usage.live).some((n) => n > 0);
export const hasHistory = (usage?: Usage | null) => !!usage && Object.values(usage.historical).some((n) => n > 0);
