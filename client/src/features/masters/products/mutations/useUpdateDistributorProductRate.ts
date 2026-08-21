import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DistributorProductRatesApi } from "../api/distributor-product-rates.api";
import type {
  UpdateDistributorProductRateRequest,
} from "../types/products.types";

export function useUpdateDistributorProductRate(productId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateDistributorProductRateRequest;
    }) => DistributorProductRatesApi.update(id, data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-configuration", productId],
      });
    },
  });
}