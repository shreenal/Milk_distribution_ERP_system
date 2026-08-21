import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClientProductRatesApi } from "../api/client-product-rates.api";

export function useDeleteClientProductRate(productId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => ClientProductRatesApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-configuration", productId],
      });
    },
  });
}