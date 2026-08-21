import { http } from "@/shared/api/http";

import type {
  GroupSupplyRule,
  CreateGroupSupplyRuleInput,
  UpdateGroupSupplyRuleInput,
} from "../types/groups.types";

export const groupSupplyRulesApi = {
  async getAll() {
    const response = await http.get<GroupSupplyRule[]>(
      "/api/group-supply-rules",
    );

    return response.data;
  },

  async getActive() {
    const response = await http.get<GroupSupplyRule[]>(
      "/api/group-supply-rules/active",
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<GroupSupplyRule>(
      `/api/group-supply-rules/${id}`,
    );

    return response.data;
  },

  async create(data: CreateGroupSupplyRuleInput) {
    const response = await http.post<GroupSupplyRule>(
      "/api/group-supply-rules",
      data,
    );

    return response.data;
  },

  async update(
    id: number,
    data: UpdateGroupSupplyRuleInput,
  ) {
    const response = await http.patch<GroupSupplyRule>(
      `/api/group-supply-rules/${id}`,
      data,
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/group-supply-rules/${id}`);
  },
};