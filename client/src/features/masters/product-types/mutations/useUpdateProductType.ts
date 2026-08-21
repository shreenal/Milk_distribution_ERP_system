import { useMutation, useQueryClient } from "@tanstack/react-query";

import { productTypesApi } from "../api/product-types.api";
import type { UpdateProductTypeRequest } from "../types/product-types.types";

export function useUpdateProductType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateProductTypeRequest;
    }) => productTypesApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["product-types"],
      });

      queryClient.invalidateQueries({
        queryKey: ["product-types", variables.id],
      });
    },
  });
}