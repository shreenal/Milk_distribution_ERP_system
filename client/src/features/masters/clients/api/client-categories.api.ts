import type {
  ClientCategory,
  CreateClientCategoryRequest,
  SupplyCategory,
} from "../types/client.types";

import { http } from "@/shared/api/http";

export const clientCategoriesApi = {
  async getAll(): Promise<ClientCategory[]> {
    const response = await http.get<ClientCategory[]>(
      "/api/client-categories",
    );

    return response.data;
  },

  async getByClient(
    clientId: number,
  ): Promise<ClientCategory[]> {
    const response = await http.get<ClientCategory[]>(
      `/api/client-categories/client/${clientId}`,
    );

    return response.data;
  },

  async create(
    data: CreateClientCategoryRequest,
  ): Promise<ClientCategory> {
    const response = await http.post<ClientCategory>(
      "/api/client-categories",
      data,
    );

    return response.data;
  },

  async delete(
    clientId: number,
    category: SupplyCategory,
  ): Promise<void> {
    await http.delete(
      `/api/client-categories/${clientId}/${category}`,
    );
  },
};