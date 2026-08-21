import { http } from "@/shared/api/http";

import type {
  Employee,
  EmployeesListResponse,
  CreateEmployeeRequest,
  UpdateEmployeeRequest,
} from "../types/employees.types";

export const employeesApi = {
  async getAll() {
    const response = await http.get<EmployeesListResponse>(
      "/api/employees",
    );

    return response.data;
  },

  async getActive() {
    const response = await http.get<EmployeesListResponse>(
      "/api/employees/active",
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<Employee>(
      `/api/employees/${id}`,
    );

    return response.data;
  },

  async create(data: CreateEmployeeRequest) {
    const response = await http.post<Employee>(
      "/api/employees",
      data,
    );

    return response.data;
  },

  async update(
    id: number,
    data: UpdateEmployeeRequest,
  ) {
    const response = await http.patch<Employee>(
      `/api/employees/${id}`,
      data,
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/employees/${id}`);
  },
};