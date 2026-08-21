import { useMutation, useQueryClient } from "@tanstack/react-query";

import { productGroupsApi } from "../api/product-groups.api";
import type { CreateProductGroupRequest } from "../types/product-groups.types";

export function useCreateProductGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateProductGroupRequest) =>
      productGroupsApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-groups"],
      });
    },
  });
}