import { apiFetch } from "../../services/api";

export interface MiRutaAccess {
  has_access: boolean;
  source: string | null;
}

export const miRutaApi = {
  verify: (code: string) => apiFetch<{ message: string }>("/api/v1/mi-ruta/codes/verify", { method: "POST", body: { code } }),
  access: () => apiFetch<MiRutaAccess>("/api/v1/mi-ruta/access"),
  redeem: (code: string) => apiFetch<MiRutaAccess>("/api/v1/mi-ruta/codes/redeem", { method: "POST", body: { code } }),
};
