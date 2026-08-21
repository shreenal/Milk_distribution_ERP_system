import { useMutation, useQueryClient } from "@tanstack/react-query";

import { expenseTypesApi } from "../api/expense-types.api";
import type { UpdateExpenseTypeRequest } from "../types/expense-types.types";

export function useUpdateExpenseType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateExpenseTypeRequest;
    }) => expenseTypesApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["expense-types"],
      });

      queryClient.invalidateQueries({
        queryKey: ["expense-types", variables.id],
      });
    },
  });
}