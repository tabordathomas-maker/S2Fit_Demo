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

export type BoxAccess = "free" | "plus";
export type ClaimStatus = "pending" | "accepted" | "rejected";

/** Portada pública de una caja: el contenido nunca viaja en la lista. */
export interface MysteryBoxCover {
  id: number;
  title: string;
  teaser: string | null;
  cover_url: string;
  cover_alt: string | null;
  content_access: BoxAccess;
}

export interface MysteryBoxContent {
  id: number;
  title: string;
  content_media_url: string | null;
  content_description: string;
  content_access: BoxAccess;
}

export interface BoxClaim {
  id: string;
  reference: string;
  status: ClaimStatus;
  box_id: number | null;
  box_title: string | null;
  customer_note: string | null;
  admin_notes: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface BoxClaimCreated extends BoxClaim {
  whatsapp_message: string;
  already_existed: boolean;
}

export interface AdminMysteryBox {
  id: number;
  title: string;
  teaser: string | null;
  cover_url: string;
  cover_alt: string | null;
  content_media_url: string | null;
  content_description: string;
  content_access: BoxAccess;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MysteryBoxInput {
  title: string;
  teaser: string | null;
  cover_url: string;
  cover_alt: string | null;
  content_media_url: string | null;
  content_description: string;
  content_access: BoxAccess;
  is_active: boolean;
  sort_order: number;
}

export interface AdminBoxClaim extends BoxClaim {
  user_id: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
}

const ADMIN = "/api/v1/admin";
const PUBLIC = "/api/v1/s2box";

export const s2boxApi = {
  images: () => apiFetch<BoxImage[]>(`${PUBLIC}/images`),
  boxes: () => apiFetch<MysteryBoxCover[]>(`${PUBLIC}/boxes`),
  boxContent: (id: number) => apiFetch<MysteryBoxContent>(`${PUBLIC}/boxes/${id}/content`),
  /** Registra el reclamo en el servidor ANTES de abrir WhatsApp. */
  claim: (boxId: number) => apiFetch<BoxClaimCreated>(`${PUBLIC}/boxes/${boxId}/claims`, { method: "POST", body: {} }),
  myClaims: () => apiFetch<BoxClaim[]>(`${PUBLIC}/claims/me`),
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
  // --- Cajas misteriosas ---
  boxes: () => apiFetch<AdminMysteryBox[]>(`${ADMIN}/s2box/boxes`),
  createBox: (body: MysteryBoxInput) => apiFetch<AdminMysteryBox>(`${ADMIN}/s2box/boxes`, { method: "POST", body }),
  updateBox: (id: number, body: Partial<MysteryBoxInput>) =>
    apiFetch<AdminMysteryBox>(`${ADMIN}/s2box/boxes/${id}`, { method: "PATCH", body }),
  removeBox: (id: number) => apiFetch<void>(`${ADMIN}/s2box/boxes/${id}`, { method: "DELETE" }),
  uploadMedia: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ url: string; media_type: "image" | "video" }>(`${ADMIN}/uploads/content-media`, { method: "POST", formData: form });
  },
  // --- Reclamos ---
  claims: (status?: ClaimStatus) => apiFetch<AdminBoxClaim[]>(`${ADMIN}/s2box/claims`, { query: { status } }),
  acceptClaim: (id: string, adminNotes?: string) =>
    apiFetch<AdminBoxClaim>(`${ADMIN}/s2box/claims/${id}/accept`, { method: "POST", body: { admin_notes: adminNotes || null } }),
  rejectClaim: (id: string, adminNotes?: string) =>
    apiFetch<AdminBoxClaim>(`${ADMIN}/s2box/claims/${id}/reject`, { method: "POST", body: { admin_notes: adminNotes || null } }),
};
