import { useMutation, useQueryClient } from "@tanstack/react-query";

import { productGroupsApi } from "../api/product-groups.api";
import type { UpdateProductGroupRequest } from "../types/product-groups.types";

export function useUpdateProductGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateProductGroupRequest;
    }) => productGroupsApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["product-groups"],
      });

      queryClient.invalidateQueries({
        queryKey: ["product-groups", variables.id],
      });
    },
  });
}