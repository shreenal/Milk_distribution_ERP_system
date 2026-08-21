import { http } from "@/shared/api/http";
import type {
  Product,
  CreateProductRequest,
  UpdateProductRequest,
  ProductsListResponse,
  ProductsQueryParams,
  ProductConfiguration,
} from "../types/products.types";

export const productsApi = {
  async getAll(params?: ProductsQueryParams) {
    const response = await http.get<ProductsListResponse>(
      "/api/products",
      { params }
    );
    return response.data;
  },

  async getActive() {
    const response = await http.get<ProductsListResponse>(
      "/api/products/active"
    );
    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<Product>(`/api/products/${id}`);
    return response.data;
  },

   async getConfiguration(id: number) {
    const response = await http.get<ProductConfiguration>(
      `/api/products/${id}/configuration`
    );
    return response.data;
  },

  async create(data: CreateProductRequest) {
    const response = await http.post<Product>("/api/products", data);
    return response.data;
  },

  async update(id: number, data: UpdateProductRequest) {
    const response = await http.patch<Product>(
      `/api/products/${id}`,
      data
    );
    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/products/${id}`);
  },
};