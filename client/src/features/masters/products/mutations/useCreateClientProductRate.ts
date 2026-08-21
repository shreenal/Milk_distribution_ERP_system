import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClientProductRatesApi } from "../api/client-product-rates.api";
import type {
  CreateClientProductRateRequest,
} from "../types/products.types";

export function useCreateClientProductRate(productId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateClientProductRateRequest) =>
      ClientProductRatesApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-configuration", productId],
      });
    },
  });
}