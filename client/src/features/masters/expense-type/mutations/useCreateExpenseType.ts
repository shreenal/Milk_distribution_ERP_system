import { useMutation, useQueryClient } from "@tanstack/react-query";

import { expenseTypesApi } from "../api/expense-types.api";
import type { CreateExpenseTypeRequest } from "../types/expense-types.types";

export function useCreateExpenseType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateExpenseTypeRequest) =>
      expenseTypesApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["expense-types"],
      });
    },
  });
}