import { http } from "@/shared/api/http";
import type {
  ClientProductRate,
  CreateClientProductRateRequest,
  UpdateClientProductRateRequest,
} from "../types/products.types";

export const ClientProductRatesApi = {
  async getAll() {
    const response = await http.get<ClientProductRate[]>("/api/client-product-rates");
    return response.data;
  },

  async getActive() {
    const response = await http.get<ClientProductRate[]>(
      "/api/client-product-rates/active"
    );
    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<ClientProductRate>(
      `/api/client-product-rates/${id}`
    );
    return response.data;
  },

  async create(data: CreateClientProductRateRequest) {
    const response = await http.post<ClientProductRate>(
      "/api/client-product-rates",
      data
    );
    return response.data;
  },

  async update(id: number, data: UpdateClientProductRateRequest) {
    const response = await http.patch<ClientProductRate>(
      `/api/client-product-rates/${id}`,
      data
    );
    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/client-product-rates/${id}`);
  },
};