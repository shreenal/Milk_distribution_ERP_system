import { useMutation, useQueryClient } from "@tanstack/react-query";

import { packagingTypesApi } from "../api/packaging-types.api";
import type { CreatePackagingTypeRequest } from "../types/packaging-types.types";

export function useCreatePackagingType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePackagingTypeRequest) =>
      packagingTypesApi.create(data),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["packaging-types"],
      });
    },
  });
}