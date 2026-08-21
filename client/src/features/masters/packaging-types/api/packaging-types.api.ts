import { http } from "@/shared/api/http";

import type {
  PackagingType,
  PackagingTypesListResponse,
  CreatePackagingTypeRequest,
  UpdatePackagingTypeRequest,
} from "../types/packaging-types.types";

export const packagingTypesApi = {
  async getAll() {
    const response = await http.get<PackagingTypesListResponse>(
      "/api/packaging-types",
    );

    return response.data;
  },

  async getById(id: number) {
    const response = await http.get<PackagingType>(
      `/api/packaging-types/${id}`,
    );

    return response.data;
  },

  async create(data: CreatePackagingTypeRequest) {
    const response = await http.post<PackagingType>(
      "/api/packaging-types",
      data,
    );

    return response.data;
  },

  async update(
    id: number,
    data: UpdatePackagingTypeRequest,
  ) {
    const response = await http.patch<PackagingType>(
      `/api/packaging-types/${id}`,
      data,
    );

    return response.data;
  },

  async delete(id: number) {
    await http.delete(`/api/packaging-types/${id}`);
  },
};