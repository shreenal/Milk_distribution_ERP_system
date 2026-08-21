import { useMutation, useQueryClient } from "@tanstack/react-query";

import { packagingTypesApi } from "../api/packaging-types.api";
import type { UpdatePackagingTypeRequest } from "../types/packaging-types.types";

export function useUpdatePackagingType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdatePackagingTypeRequest;
    }) => packagingTypesApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["packaging-types"],
      });

      queryClient.invalidateQueries({
        queryKey: ["packaging-types", variables.id],
      });
    },
  });
}