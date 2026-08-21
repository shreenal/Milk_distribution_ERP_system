import { useMutation, useQueryClient } from "@tanstack/react-query";

import { dairiesApi } from "../api/dairies.api";

export function useDeleteDairy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      dairiesApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["dairies"],
      });
    },
  });
}