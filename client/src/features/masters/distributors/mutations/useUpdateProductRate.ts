import { useMutation, useQueryClient } from "@tanstack/react-query";

import { distributorProductRatesApi } from "../api/distributor-product-rates.api";

import type {
  UpdateDistributorProductRateRequest,
} from "../types/distributors.types";

export function useUpdateProductRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateDistributorProductRateRequest;
    }) => distributorProductRatesApi.update(id, data),

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