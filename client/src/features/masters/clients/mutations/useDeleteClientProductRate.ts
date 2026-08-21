import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ClientProductRatesApi } from "../api/client-product-rates.api";

export function useDeleteClientProductRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      ClientProductRatesApi.delete(id),

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