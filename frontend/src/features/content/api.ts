import { apiFetch } from "../../services/api";
import type { ContentItem, ContentKind } from "../../services/types";

export const contentApi = {
  list: (kind?: ContentKind) => apiFetch<ContentItem[]>("/api/v1/content", { query: { kind } }),
  get: (id: number) => apiFetch<ContentItem>(`/api/v1/content/${id}`),
};
