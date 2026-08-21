import { useMutation, useQueryClient } from "@tanstack/react-query";

import { banksApi } from "../api/banks.api";

export function useDeleteBank() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      banksApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["banks"],
      });
    },
  });
}