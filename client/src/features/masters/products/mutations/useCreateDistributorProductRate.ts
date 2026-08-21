import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DistributorProductRatesApi } from "../api/distributor-product-rates.api";
import type {
  CreateDistributorProductRateRequest,
} from "../types/products.types";

export function useCreateDistributorProductRate(productId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDistributorProductRateRequest) =>
      DistributorProductRatesApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-configuration", productId],
      });
    },
  });
}