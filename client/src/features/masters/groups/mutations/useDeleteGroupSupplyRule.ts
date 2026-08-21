import { useMutation, useQueryClient } from "@tanstack/react-query";

import { groupSupplyRulesApi } from "../api/group-supply-rules.api";

export function useDeleteGroupSupplyRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      groupSupplyRulesApi.delete(id),

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["group-supply-rules"],
      });
    },
  });
}