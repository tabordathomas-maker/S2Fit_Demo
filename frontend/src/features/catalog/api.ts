import { apiFetch } from "../../services/api";
import type { Category, ProductDetail, ProductSummary } from "../../services/types";

export interface ProductFilters {
  q?: string;
  category?: string;
  size?: string;
  color?: string;
}

export const catalogApi = {
  categories: () => apiFetch<Category[]>("/api/v1/catalog/categories"),
  products: (filters: ProductFilters = {}) =>
    apiFetch<ProductSummary[]>("/api/v1/catalog/products", { query: { ...filters } }),
  product: (slug: string) => apiFetch<ProductDetail>(`/api/v1/catalog/products/${encodeURIComponent(slug)}`),
};
