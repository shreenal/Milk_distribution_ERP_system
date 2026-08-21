import { http } from "@/shared/api/http";
import type {
  DistributorProductLink,
  CreateDistributorProductLinkRequest,
  UpdateDistributorProductLinkRequest,
} from "../types/distributors.types";

export const distributorProductLinksApi = {
  async getAll() {
    const response = await http.get<DistributorProductLink[]>("/api/product-links");
    return response.data;
  },

  async getActive() {
    const response = await http.get<DistributorProductLink[]>(
      "/api/product-links/active"
    );
    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<DistributorProductLink>(
      `/api/product-links/${id}`
    );
    return response.data;
  },

  async create(data: CreateDistributorProductLinkRequest) {
    const response = await http.post<DistributorProductLink>(
      "/api/product-links",
      data
    );
    return response.data;
  },

  async update(id: number, data: UpdateDistributorProductLinkRequest) {
    const response = await http.patch<DistributorProductLink>(
      `/api/product-links/${id}`,
      data
    );
    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/product-links/${id}`);
  },
};