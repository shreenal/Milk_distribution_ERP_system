import { useMutation, useQueryClient } from "@tanstack/react-query";

import { distributorProductRatesApi } from "../api/distributor-product-rates.api";

export function useDeleteProductRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      distributorProductRatesApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["distributor-product-rates"],
      });

      queryClient.invalidateQueries({
        queryKey: ["distributor-product-rates-active"],
      });

      queryClient.invalidateQueries({
        queryKey: ["product-links"],
      });
    },
  });
}