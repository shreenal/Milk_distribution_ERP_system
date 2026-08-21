import { useMutation, useQueryClient } from "@tanstack/react-query";

import { brandsApi } from "../api/brands.api";

export function useDeleteBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      brandsApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["brands"],
      });

      queryClient.invalidateQueries({
        queryKey: ["brands-active"],
      });
    },
  });
}