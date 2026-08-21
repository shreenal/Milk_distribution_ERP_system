import { http } from "@/shared/api/http";

import type {
  Driver,
  DriversListResponse,
  CreateDriverRequest,
  UpdateDriverRequest,
} from "../types/drivers.types";

export const driversApi = {
  async getAll() {
    const response = await http.get<DriversListResponse>(
      "/api/drivers",
    );

    return response.data;
  },

  async getActive() {
    const response = await http.get<DriversListResponse>(
      "/api/drivers/active",
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<Driver>(
      `/api/drivers/${id}`,
    );

    return response.data;
  },

  async create(data: CreateDriverRequest) {
    const response = await http.post<Driver>(
      "/api/drivers",
      data,
    );

    return response.data;
  },

  async update(
    id: number,
    data: UpdateDriverRequest,
  ) {
    const response = await http.patch<Driver>(
      `/api/drivers/${id}`,
      data,
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/drivers/${id}`);
  },
};