import { useMutation, useQueryClient } from "@tanstack/react-query";
import { productLinksApi } from "../api/product-links.api";

export function useDeleteProductLink(productId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => productLinksApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-configuration", productId],
      });
    },
  });
}