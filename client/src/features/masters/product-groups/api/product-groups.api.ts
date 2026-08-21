import { http } from "@/shared/api/http";

import type {
  ProductGroup,
  ProductGroupsListResponse,
  CreateProductGroupRequest,
  UpdateProductGroupRequest,
} from "../types/product-groups.types";

export const productGroupsApi = {
  async getAll() {
    const response = await http.get<ProductGroupsListResponse>(
      "/api/product-groups",
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<ProductGroup>(
      `/api/product-groups/${id}`,
    );

    return response.data;
  },

  async create(data: CreateProductGroupRequest) {
    const response = await http.post<ProductGroup>(
      "/api/product-groups",
      data,
    );

    return response.data;
  },

  async update(
    id: number,
    data: UpdateProductGroupRequest,
  ) {
    const response = await http.patch<ProductGroup>(
      `/api/product-groups/${id}`,
      data,
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/product-groups/${id}`);
  },
};