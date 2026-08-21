import { useMutation, useQueryClient } from "@tanstack/react-query";

import { brandsApi } from "../api/brands.api";
import type { UpdateBrandInput } from "../types/brands.types";

export function useUpdateBrand() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: UpdateBrandInput;
    }) => brandsApi.update(id, data),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["brands"],
      });

      queryClient.invalidateQueries({
        queryKey: ["brands-active"],
      });

      queryClient.invalidateQueries({
        queryKey: ["brands", variables.id],
      });
    },
  });
}