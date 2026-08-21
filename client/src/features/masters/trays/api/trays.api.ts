import { http } from "@/shared/api/http";

import type {
  TrayType,
  TrayTypesList,
  CreateTrayTypeInput,
  UpdateTrayTypeInput,
} from "../types/trays.types";

export const traysApi = {
  async getAll() {
    const response = await http.get<TrayTypesList>(
      "/api/tray-types"
    );

    return response.data;
  },

  async getActive() {
    const response = await http.get<TrayTypesList>(
      "/api/tray-types/active"
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<TrayType>(
      `/api/tray-types/${id}`
    );

    return response.data;
  },

  async create(data: CreateTrayTypeInput) {
    const response = await http.post<TrayType>(
      "/api/tray-types",
      data
    );

    return response.data;
  },

  async update(id: number, data: UpdateTrayTypeInput) {
    const response = await http.patch<TrayType>(
      `/api/tray-types/${id}`,
      data
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/tray-types/${id}`);
  },
};