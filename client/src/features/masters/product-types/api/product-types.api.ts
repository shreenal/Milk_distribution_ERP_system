import { http } from "@/shared/api/http";

import type {
  ProductType,
  ProductTypesListResponse,
  CreateProductTypeRequest,
  UpdateProductTypeRequest,
} from "../types/product-types.types";

export const productTypesApi = {
  async getAll() {
    const response = await http.get<ProductTypesListResponse>(
      "/api/product-types",
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<ProductType>(
      `/api/product-types/${id}`,
    );

    return response.data;
  },

  async create(data: CreateProductTypeRequest) {
    const response = await http.post<ProductType>(
      "/api/product-types",
      data,
    );

    return response.data;
  },

  async update(
    id: number,
    data: UpdateProductTypeRequest,
  ) {
    const response = await http.patch<ProductType>(
      `/api/product-types/${id}`,
      data,
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/product-types/${id}`);
  },
};