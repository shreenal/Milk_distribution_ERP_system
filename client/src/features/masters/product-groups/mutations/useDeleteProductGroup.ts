import { useMutation, useQueryClient } from "@tanstack/react-query";

import { productGroupsApi } from "../api/product-groups.api";

export function useDeleteProductGroup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      productGroupsApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["product-groups"],
      });
    },
  });
}