import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ClientProductRatesApi } from "../api/client-product-rates.api";
import type {
  CreateClientProductRateRequest,
} from "../types/client.types";

export function useCreateClientProductRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateClientProductRateRequest) =>
      ClientProductRatesApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["client-product-rates"],
      });

      queryClient.invalidateQueries({
        queryKey: ["client-product-rates-active"],
      });
    },
  });
}