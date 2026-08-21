import { useMutation, useQueryClient } from "@tanstack/react-query";

import { distributorProductRatesApi } from "../api/distributor-product-rates.api";

import type {
  CreateDistributorProductRateRequest,
} from "../types/distributors.types";

export function useCreateProductRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDistributorProductRateRequest) =>
      distributorProductRatesApi.create(data),

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