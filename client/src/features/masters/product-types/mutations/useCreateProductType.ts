import { useMutation, useQueryClient } from "@tanstack/react-query";

import { productTypesApi } from "../api/product-types.api";
import type { CreateProductTypeRequest } from "../types/product-types.types";

export function useCreateProductType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProductTypeRequest) =>
      productTypesApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-types"],
      });
    },
  });
}