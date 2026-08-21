import { useMutation, useQueryClient } from "@tanstack/react-query";

import { clientCategoriesApi } from "../api/client-categories.api";
import type { CreateClientCategoryRequest } from "../types/client.types";

export function useCreateClientCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateClientCategoryRequest) =>
      clientCategoriesApi.create(data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["client-categories"],
      });

      queryClient.invalidateQueries({
        queryKey: [
          "client-categories",
          "client",
          variables.client_id,
        ],
      });

      queryClient.invalidateQueries({
        queryKey: ["clients"],
      });
    },
  });
}