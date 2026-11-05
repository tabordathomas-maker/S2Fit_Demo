import { apiFetch } from "../../services/api";

export interface BoxImage {
  id: number;
  url: string;
  alt_text: string | null;
  sort_order: number;
}

export interface AdminBoxImage extends BoxImage {
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const ADMIN = "/api/v1/admin";

export const s2boxApi = {
  images: () => apiFetch<BoxImage[]>("/api/v1/s2box/images"),
};

export const s2boxAdminApi = {
  list: () => apiFetch<AdminBoxImage[]>(`${ADMIN}/s2box/images`),
  create: (body: { url: string; alt_text?: string | null; sort_order?: number; is_active?: boolean }) =>
    apiFetch<AdminBoxImage>(`${ADMIN}/s2box/images`, { method: "POST", body }),
  update: (id: number, body: { url?: string; alt_text?: string | null; sort_order?: number; is_active?: boolean }) =>
    apiFetch<AdminBoxImage>(`${ADMIN}/s2box/images/${id}`, { method: "PATCH", body }),
  remove: (id: number) => apiFetch<void>(`${ADMIN}/s2box/images/${id}`, { method: "DELETE" }),
  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ url: string }>(`${ADMIN}/uploads/s2box-image`, { method: "POST", formData: form });
  },
};
