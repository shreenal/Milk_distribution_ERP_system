import { useMutation, useQueryClient } from "@tanstack/react-query";
import { productsApi } from "../api/products.api";
import type { UpdateProductRequest } from "../types/products.types";

export function useUpdateProduct(id: number | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateProductRequest) =>
      productsApi.update(id!, data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["products"],
      });

      queryClient.invalidateQueries({
        queryKey: ["products", id],
      });

      queryClient.invalidateQueries({
        queryKey: ["products-active"],
      });

      queryClient.invalidateQueries({
        queryKey: ["product-configuration", id],
      });
    },
  });
}