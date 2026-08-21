import { useMutation, useQueryClient } from "@tanstack/react-query";

import { productTypesApi } from "../api/product-types.api";

export function useDeleteProductType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      productTypesApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-types"],
      });
    },
  });
}