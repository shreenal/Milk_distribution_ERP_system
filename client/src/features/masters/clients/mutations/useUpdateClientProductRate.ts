import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ClientProductRatesApi } from "../api/client-product-rates.api";
import type {
  UpdateClientProductRateRequest,
} from "../types/client.types";

export function useUpdateClientProductRate() {
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
        queryKey: ["client-product-rates"],
      });

      queryClient.invalidateQueries({
        queryKey: ["client-product-rates-active"],
      });
    },
  });
}