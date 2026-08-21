import { http } from "@/shared/api/http";

import type {
  ExpenseType,
  ExpenseTypesListResponse,
  CreateExpenseTypeRequest,
  UpdateExpenseTypeRequest,
} from "../types/expense-types.types";

export const expenseTypesApi = {
  async getAll() {
    const response = await http.get<ExpenseTypesListResponse>(
      "/api/expense-types",
    );

    return response.data;
  },

  async getActive() {
    const response = await http.get<ExpenseTypesListResponse>(
      "/api/expense-types/active",
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<ExpenseType>(
      `/api/expense-types/${id}`,
    );

    return response.data;
  },

  async create(data: CreateExpenseTypeRequest) {
    const response = await http.post<ExpenseType>(
      "/api/expense-types",
      data,
    );

    return response.data;
  },

  async update(
    id: number,
    data: UpdateExpenseTypeRequest,
  ) {
    const response = await http.patch<ExpenseType>(
      `/api/expense-types/${id}`,
      data,
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/expense-types/${id}`);
  },
};