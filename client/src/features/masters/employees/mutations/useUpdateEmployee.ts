import { useMutation, useQueryClient } from "@tanstack/react-query";

import { employeesApi } from "../api/employees.api";
import type { UpdateEmployeeRequest } from "../types/employees.types";

export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateEmployeeRequest;
    }) => employeesApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["employees"],
      });

      queryClient.invalidateQueries({
        queryKey: ["employees", variables.id],
      });
    },
  });
}