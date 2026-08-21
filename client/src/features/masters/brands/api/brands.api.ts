import { http } from "@/shared/api/http";

import type {
  Brand,
  BrandsList,
  CreateBrandInput,
  UpdateBrandInput,
} from "../types/brands.types";

export const brandsApi = {
  async getAll() {
    const response = await http.get<BrandsList>(
      "/api/brands"
    );

    return response.data;
  },

  async getActive() {
    const response = await http.get<BrandsList>(
      "/api/brands/active"
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<Brand>(
      `/api/brands/${id}`
    );

    return response.data;
  },

  async create(data: CreateBrandInput) {
    const response = await http.post<Brand>(
      "/api/brands",
      data
    );

    return response.data;
  },

  async update(id: number, data: UpdateBrandInput) {
    const response = await http.patch<Brand>(
      `/api/brands/${id}`,
      data
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/brands/${id}`);
  },
};