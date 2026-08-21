import { useMutation, useQueryClient } from "@tanstack/react-query";

import { brandsApi } from "../api/brands.api";
import type { CreateBrandInput } from "../types/brands.types";

export function useCreateBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBrandInput) =>
      brandsApi.create(data),

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