import { http } from "@/shared/api/http";

import type {
  Group,
  GroupsList,
  CreateGroupInput,
  UpdateGroupInput,
} from "../types/groups.types";

export const groupsApi = {
  async getAll() {
    const response = await http.get<GroupsList>(
      "/api/groups"
    );

    return response.data;
  },

  async getActive() {
    const response = await http.get<GroupsList>(
      "/api/groups/active"
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<Group>(
      `/api/groups/${id}`
    );

    return response.data;
  },

  async create(data: CreateGroupInput) {
    const response = await http.post<Group>(
      "/api/groups",
      data
    );

    return response.data;
  },

  async update(id: number, data: UpdateGroupInput) {
    const response = await http.patch<Group>(
      `/api/groups/${id}`,
      data
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/groups/${id}`);
  },
};