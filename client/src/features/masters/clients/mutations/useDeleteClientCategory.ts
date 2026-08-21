import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clientCategoriesApi } from "../api/client-categories.api";
import type { SupplyCategory } from "../types/client.types";

export function useDeleteClientCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      clientId,
      category,
    }: {
      clientId: number;
      category: SupplyCategory;
    }) =>
      clientCategoriesApi.delete(
        clientId,
        category,
      ),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["client-categories"],
      });

      queryClient.invalidateQueries({
        queryKey: [
          "client-categories",
          "client",
          variables.clientId,
        ],
      });

      queryClient.invalidateQueries({
        queryKey: ["clients"],
      });
    },
  });
}