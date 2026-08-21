import { useMutation, useQueryClient } from "@tanstack/react-query";
import { productLinksApi } from "../api/product-links.api";
import type { UpdateProductLinkRequest } from "../types/products.types";

export function useUpdateProductLink(productId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateProductLinkRequest;
    }) => productLinksApi.update(id, data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-configuration", productId],
      });
    },
  });
}