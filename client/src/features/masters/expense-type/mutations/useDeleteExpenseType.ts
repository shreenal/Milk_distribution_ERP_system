import { useMutation, useQueryClient } from "@tanstack/react-query";

import { expenseTypesApi } from "../api/expense-types.api";

export function useDeleteExpenseType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      expenseTypesApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["expense-types"],
      });
    },
  });
}