import { http } from "@/shared/api/http";

import type {
  Client,
  ClientsListResponse,
  CreateClientRequest,
  UpdateClientRequest,
} from "../types/client.types";

export const clientsApi = {
  async getAll() {
    const response = await http.get<ClientsListResponse>(
      "/api/clients"
    );

    return response.data;
  },

  async getActive() {
    const response = await http.get<ClientsListResponse>(
      "/api/clients/active"
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<Client>(
      `/api/clients/${id}`
    );

    return response.data;
  },

  async create(data: CreateClientRequest) {
    const response = await http.post<Client>(
      "/api/clients",
      data
    );

    return response.data;
  },

  async update(id: number, data: UpdateClientRequest) {
    const response = await http.patch<Client>(
      `/api/clients/${id}`,
      data
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/clients/${id}`);
  },
};