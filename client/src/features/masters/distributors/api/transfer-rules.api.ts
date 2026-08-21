import { http } from "@/shared/api/http";

import type {
  DistributorTransferRule,
  CreateDistributorTransferRuleInput,
  UpdateDistributorTransferRuleInput,
} from "../types/distributors.types";

export const transferRulesApi = {
  async getAll() {
    const response = await http.get<DistributorTransferRule[]>(
      "/api/transfer-rules",
    );

    return response.data;
  },

  async getActive() {
    const response = await http.get<DistributorTransferRule[]>(
      "/api/transfer-rules/active",
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<DistributorTransferRule>(
      `/api/transfer-rules/${id}`,
    );

    return response.data;
  },

  async create(data: CreateDistributorTransferRuleInput) {
    const response = await http.post<DistributorTransferRule>(
      "/api/transfer-rules",
      data,
    );

    return response.data;
  },

  async update(
    id: number,
    data: UpdateDistributorTransferRuleInput,
  ) {
    const response = await http.patch<DistributorTransferRule>(
      `/api/transfer-rules/${id}`,
      data,
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/transfer-rules/${id}`);
  },
};