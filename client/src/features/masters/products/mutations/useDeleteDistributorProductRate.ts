import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DistributorProductRatesApi } from "../api/distributor-product-rates.api";

export function useDeleteDistributorProductRate(productId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => DistributorProductRatesApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-configuration", productId],
      });
    },
  });
}