import { useMutation, useQueryClient } from "@tanstack/react-query";

import { packagingTypesApi } from "../api/packaging-types.api";

export function useDeletePackagingType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      packagingTypesApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["packaging-types"],
      });
    },
  });
}