import { http } from "@/shared/api/http";

import type {
  Bank,
  BanksListResponse,
  CreateBankRequest,
  UpdateBankRequest,
} from "../types/banks.types";

export const banksApi = {
  async getAll() {
    const response = await http.get<BanksListResponse>(
      "/api/banks",
    );

    return response.data;
  },

  async getActive() {
    const response = await http.get<BanksListResponse>(
      "/api/banks/active",
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<Bank>(
      `/api/banks/${id}`,
    );

    return response.data;
  },

  async create(data: CreateBankRequest) {
    const response = await http.post<Bank>(
      "/api/banks",
      data,
    );

    return response.data;
  },

  async update(
    id: number,
    data: UpdateBankRequest,
  ) {
    const response = await http.patch<Bank>(
      `/api/banks/${id}`,
      data,
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/banks/${id}`);
  },
};