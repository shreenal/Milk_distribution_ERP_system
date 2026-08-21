import { http } from "@/shared/api/http";

import type {
  ProductTrayRule,
  CreateTrayRuleRequest,
  UpdateTrayRuleRequest,
} from "../types/trays.types";

export const TrayRulesApi = {
  async getAll() {
    const response = await http.get<ProductTrayRule[]>(
      "/api/tray-rules",
    );
    return response.data;
  },

  async getActive() {
    const response = await http.get<ProductTrayRule[]>(
      "/api/tray-rules/active",
    );
    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<ProductTrayRule>(
      `/api/tray-rules/${id}`,
    );
    return response.data;
  },

  async create(data: CreateTrayRuleRequest) {
    const response = await http.post<ProductTrayRule>(
      "/api/tray-rules",
      data,
    );
    return response.data;
  },

  async update(
    id: number,
    data: UpdateTrayRuleRequest,
  ) {
    const response = await http.patch<ProductTrayRule>(
      `/api/tray-rules/${id}`,
      data,
    );
    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/tray-rules/${id}`);
  },
};