/** Tiempos de espera de las lecturas: si un GET tarda más de `slowAfterMs` se avisa; ante fallos de red o 502/503/504 se reintenta. */
export const retryPolicy = { slowAfterMs: 4000, delaysMs: [2000, 5000, 10000] };
