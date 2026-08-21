import { useMutation, useQueryClient } from "@tanstack/react-query";

import { employeesApi } from "../api/employees.api";
import type { CreateEmployeeRequest } from "../types/employees.types";

export function useCreateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEmployeeRequest) =>
      employeesApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["employees"],
      });
    },
  });
}