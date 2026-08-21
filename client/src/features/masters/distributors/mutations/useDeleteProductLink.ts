import { useMutation, useQueryClient } from "@tanstack/react-query";

import { distributorProductLinksApi } from "../api/distributor-product-links.api";

export function useDeleteProductLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      distributorProductLinksApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["distributor-product-links"],
      });

      queryClient.invalidateQueries({
        queryKey: ["distributor-product-links-active"],
      });
    },
  });
}