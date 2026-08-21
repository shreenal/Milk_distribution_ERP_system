import { http } from "@/shared/api/http";

import type {
  Vehicle,
  VehiclesListResponse,
  CreateVehicleRequest,
  UpdateVehicleRequest,
} from "../types/vehicles.types";

export const vehiclesApi = {
  async getAll() {
    const response = await http.get<VehiclesListResponse>(
      "/api/vehicles",
    );

    return response.data;
  },

  async getActive() {
    const response = await http.get<VehiclesListResponse>(
      "/api/vehicles/active",
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<Vehicle>(
      `/api/vehicles/${id}`,
    );

    return response.data;
  },

  async create(data: CreateVehicleRequest) {
    const response = await http.post<Vehicle>(
      "/api/vehicles",
      data,
    );

    return response.data;
  },

  async update(
    id: number,
    data: UpdateVehicleRequest,
  ) {
    const response = await http.patch<Vehicle>(
      `/api/vehicles/${id}`,
      data,
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/vehicles/${id}`);
  },
};