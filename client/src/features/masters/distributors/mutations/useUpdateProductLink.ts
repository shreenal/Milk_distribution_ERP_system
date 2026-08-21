import { useMutation, useQueryClient } from "@tanstack/react-query";

import { distributorProductLinksApi } from "../api/distributor-product-links.api";
import type {
  UpdateDistributorProductLinkRequest,
} from "../types/distributors.types";

export function useUpdateProductLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateDistributorProductLinkRequest;
    }) => distributorProductLinksApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["distributor-product-links"],
      });

      queryClient.invalidateQueries({
        queryKey: ["distributor-product-links-active"],
      });

      queryClient.invalidateQueries({
        queryKey: ["distributor-product-links", variables.id],
      });
    },
  });
}