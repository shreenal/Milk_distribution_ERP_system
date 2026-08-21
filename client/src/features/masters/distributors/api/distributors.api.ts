import { http } from "@/shared/api/http";

import type {
  Distributor,
  CreateDistributorRequest,
  UpdateDistributorRequest,
  DistributorsListResponse,
} from "../types/distributors.types";

export const distributorsApi = {
  async getAll() {
    const response = await http.get<DistributorsListResponse>(
      "/api/distributors"
    );
    return response.data;
  },

  async getActive() {
    const response = await http.get<DistributorsListResponse>(
      "/api/distributors/active"
    );
    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<Distributor>(
      `/api/distributors/${id}`
    );
    return response.data;
  },

  async create(data: CreateDistributorRequest) {
    const response = await http.post<Distributor>(
      "/api/distributors",
      data
    );
    return response.data;
  },

  async update(id: number, data: UpdateDistributorRequest) {
    const response = await http.patch<Distributor>(
      `/api/distributors/${id}`,
      data
    );
    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/distributors/${id}`);
  },
};