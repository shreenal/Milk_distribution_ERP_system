import { http } from "@/shared/api/http";
import type {
  DistributorProcurementRule,
  CreateDistributorProcurementRuleRequest,
  UpdateDistributorProcurementRuleRequest,
} from "../types/products.types";

export const distributorProcurementRulesApi = {
  async getAll() {
    const response = await http.get<DistributorProcurementRule[]>(
      "/api/procurement-rules"
    );
    return response.data;
  },

  async getActive() {
    const response = await http.get<DistributorProcurementRule[]>(
      "/api/procurement-rules/active"
    );
    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<DistributorProcurementRule>(
      `/api/procurement-rules/${id}`
    );
    return response.data;
  },

  async create(data: CreateDistributorProcurementRuleRequest) {
    const response = await http.post<DistributorProcurementRule>(
      "/api/procurement-rules",
      data
    );
    return response.data;
  },

  async update(
    id: number,
    data: UpdateDistributorProcurementRuleRequest
  ) {
    const response = await http.patch<DistributorProcurementRule>(
      `/api/procurement-rules/${id}`,
      data
    );
    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/procurement-rules/${id}`);
  },
};