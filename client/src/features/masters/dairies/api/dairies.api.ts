import { http } from "@/shared/api/http";

import type {
  Dairy,
  DairiesListResponse,
  CreateDairyRequest,
  UpdateDairyRequest,
} from "../types/dairies.types";

export const dairiesApi = {
  async getAll() {
    const response = await http.get<DairiesListResponse>(
      "/api/dairies",
    );

    return response.data;
  },

  async getActive() {
    const response = await http.get<DairiesListResponse>(
      "/api/dairies/active",
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<Dairy>(
      `/api/dairies/${id}`,
    );

    return response.data;
  },

  async create(data: CreateDairyRequest) {
    const response = await http.post<Dairy>(
      "/api/dairies",
      data,
    );

    return response.data;
  },

  async update(id: number, data: UpdateDairyRequest) {
    const response = await http.patch<Dairy>(
      `/api/dairies/${id}`,
      data,
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/dairies/${id}`);
  },
};