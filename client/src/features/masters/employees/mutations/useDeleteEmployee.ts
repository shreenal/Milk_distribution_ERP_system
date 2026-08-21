import { useMutation, useQueryClient } from "@tanstack/react-query";

import { employeesApi } from "../api/employees.api";

export function useDeleteEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      employeesApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["employees"],
      });
    },
  });
}