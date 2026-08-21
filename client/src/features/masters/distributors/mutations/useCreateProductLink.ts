import { useMutation, useQueryClient } from "@tanstack/react-query";

import { distributorProductLinksApi } from "../api/distributor-product-links.api";
import type {
  CreateDistributorProductLinkRequest,
} from "../types/distributors.types";

export function useCreateProductLink() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateDistributorProductLinkRequest) =>
      distributorProductLinksApi.create(data),

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