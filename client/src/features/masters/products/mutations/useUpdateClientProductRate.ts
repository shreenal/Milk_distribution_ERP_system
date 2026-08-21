import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClientProductRatesApi } from "../api/client-product-rates.api";
import type {
  UpdateClientProductRateRequest,
} from "../types/products.types";

export function useUpdateClientProductRate(productId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateClientProductRateRequest;
    }) => ClientProductRatesApi.update(id, data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-configuration", productId],
      });
    },
  });
}