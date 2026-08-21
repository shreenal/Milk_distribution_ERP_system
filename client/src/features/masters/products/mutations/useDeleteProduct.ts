import { useMutation, useQueryClient } from "@tanstack/react-query";
import { productsApi } from "../api/products.api";

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => productsApi.delete(id),

    onSuccess: (_, id) => {
      queryClient.invalidateQueries({
        queryKey: ["products"],
      });

      queryClient.invalidateQueries({
        queryKey: ["products-active"],
      });

      queryClient.removeQueries({
        queryKey: ["product-configuration", id],
      });
    },
  });
}