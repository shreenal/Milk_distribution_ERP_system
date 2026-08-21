import { http } from "@/shared/api/http";
import type {
  ProductLink,
  CreateProductLinkRequest,
  UpdateProductLinkRequest,
} from "../types/products.types";

export const productLinksApi = {
  async getAll() {
    const response = await http.get<ProductLink[]>("/api/product-links");
    return response.data;
  },

  async getActive() {
    const response = await http.get<ProductLink[]>(
      "/api/product-links/active"
    );
    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<ProductLink>(
      `/api/product-links/${id}`
    );
    return response.data;
  },

  async create(data: CreateProductLinkRequest) {
    const response = await http.post<ProductLink>(
      "/api/product-links",
      data
    );
    return response.data;
  },

  async update(id: number, data: UpdateProductLinkRequest) {
    const response = await http.patch<ProductLink>(
      `/api/product-links/${id}`,
      data
    );
    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/product-links/${id}`);
  },
};