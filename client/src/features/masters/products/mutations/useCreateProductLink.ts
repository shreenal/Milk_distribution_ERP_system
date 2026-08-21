import { useMutation, useQueryClient } from "@tanstack/react-query";
import { productLinksApi } from "../api/product-links.api";
import type { CreateProductLinkRequest } from "../types/products.types";

export function useCreateProductLink(productId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProductLinkRequest) =>
      productLinksApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-configuration", productId],
      });
    },
  });
}