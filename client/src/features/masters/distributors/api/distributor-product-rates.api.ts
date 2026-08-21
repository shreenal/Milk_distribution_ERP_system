import { http } from "@/shared/api/http";

import type {
  DistributorProductRate,
  CreateDistributorProductRateRequest,
  UpdateDistributorProductRateRequest,
} from "../types/distributors.types";

export const distributorProductRatesApi = {
  async getAll() {
    const response = await http.get<DistributorProductRate[]>(
      "/api/distributor-product-rates",
    );

    return response.data;
  },

  async getActive() {
    const response = await http.get<DistributorProductRate[]>(
      "/api/distributor-product-rates/active",
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<DistributorProductRate>(
      `/api/distributor-product-rates/${id}`,
    );

    return response.data;
  },

  async create(data: CreateDistributorProductRateRequest) {
    const response = await http.post<DistributorProductRate>(
      "/api/distributor-product-rates",
      data,
    );

    return response.data;
  },

  async update(
    id: number,
    data: UpdateDistributorProductRateRequest,
  ) {
    const response = await http.patch<DistributorProductRate>(
      `/api/distributor-product-rates/${id}`,
      data,
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/distributor-product-rates/${id}`);
  },
};